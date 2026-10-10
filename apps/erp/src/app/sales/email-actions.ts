"use server";
// Sales email (roadmap #2): an Account's mail, sending from the pilot mailbox, templates. Reading needs Sales viewer;
// sending and templates need Sales editor. The mailbox is the one OTP mail uses (SMTP_*); lib/mail/sync.ts reads it.
import nodemailer from "nodemailer";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { crmClientContacts, crmClients, crmEmailTemplates, crmEmails, mailSyncState } from "@/db/schema";
import { requireActor } from "@/lib/actor";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { logActivity } from "@/lib/activity-log";
import { mailbox, syncMailbox, touchLastCommunication } from "@/lib/mail/sync";
import { normAddress, parseAddressList, snippet, threadKey } from "@/lib/mail/model";

export type MailRow = {
  id: string; threadKey: string; messageId: string; direction: string; from: string; fromName: string | null; to: string[]; cc: string[];
  subject: string; body: string | null; snippet: string | null; sentAt: string; source: string; by: string | null;
};
export type MailStatus = { mailbox: string | null; lastSyncedAt: string | null; lastError: string | null };
export type MailTemplate = { id: string; name: string; subject: string; body: string };

async function status(): Promise<MailStatus> {
  const box = mailbox();
  const rows = box ? await db.select().from(mailSyncState).where(eq(mailSyncState.mailbox, box.user)) : [];
  const synced = rows.map((r) => r.last_synced_at).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  return { mailbox: box?.user ?? null, lastSyncedAt: synced?.toISOString() ?? null, lastError: rows.find((r) => r.last_error)?.last_error ?? null };
}

export async function getAccountEmails(clientId: string): Promise<{ emails: MailRow[]; status: MailStatus }> {
  await requireActor();
  await requireDivisionAccess("sales", "viewer");
  const rows = await db.select().from(crmEmails).where(eq(crmEmails.client_id, clientId)).orderBy(desc(crmEmails.sent_at)).limit(200);
  return {
    emails: rows.map((r) => ({
      id: r.id, threadKey: r.thread_key, messageId: r.message_id, direction: r.direction, from: r.from_address, fromName: r.from_name,
      to: r.to_addresses, cc: r.cc_addresses, subject: r.subject, body: r.body_text, snippet: r.snippet, sentAt: r.sent_at.toISOString(),
      source: r.source, by: r.created_by_name,
    })),
    status: await status(),
  };
}

export async function syncMailboxNow(): Promise<{ ok: true; stored: number } | { ok: false; error: string }> {
  await requireActor();
  await requireDivisionAccess("sales", "viewer");
  if (!mailbox()) return { ok: false, error: "Mailbox belum dikonfigurasi di server." };
  try { return { ok: true, ...(await syncMailbox()) }; }
  catch (err) { return { ok: false, error: (err as Error)?.message || "Sinkronisasi gagal" }; }
}

export type SendInput = { clientId: string; to: string; cc?: string; subject: string; body: string; inReplyTo?: string | null };

export async function sendAccountEmail(input: SendInput): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireActor();
  const actor = await requireDivisionAccess("sales");
  const box = mailbox();
  if (!box || !process.env.SMTP_HOST) return { ok: false, error: "Mailbox belum dikonfigurasi di server." };
  const to = parseAddressList(input.to ?? "");
  const cc = parseAddressList(input.cc ?? "");
  if (!to.valid.length) return { ok: false, error: "Isi minimal satu alamat penerima." };
  if (to.invalid.length || cc.invalid.length) return { ok: false, error: `Alamat tidak valid: ${[...to.invalid, ...cc.invalid].join(", ")}` };
  if (to.valid.length + cc.valid.length > 20) return { ok: false, error: "Maksimal 20 penerima." };
  const subject = (input.subject ?? "").trim().slice(0, 300);
  const body = (input.body ?? "").trim();
  if (!subject || !body) return { ok: false, error: "Subjek dan isi email wajib diisi." };
  if (body.length > 50_000) return { ok: false, error: "Isi email terlalu panjang." };

  const [account] = await db.select({ id: crmClients.id, name: crmClients.name }).from(crmClients).where(eq(crmClients.id, input.clientId));
  if (!account) return { ok: false, error: "Account tidak ditemukan." };
  const contacts = await db.select({ id: crmClientContacts.id, email: crmClientContacts.email }).from(crmClientContacts).where(eq(crmClientContacts.client_id, account.id));
  const contact = contacts.find((c) => c.email && to.valid.includes(normAddress(c.email)));

  // A reply carries the thread: In-Reply-To and References from the message answered.
  const [parent] = input.inReplyTo ? await db.select().from(crmEmails).where(eq(crmEmails.message_id, input.inReplyTo)) : [];
  const references = parent ? Array.from(new Set([parent.thread_key, parent.message_id])) : undefined;

  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: process.env.SMTP_HOST !== "127.0.0.1",
    auth: { user: process.env.SMTP_USER, pass: box.pass }, logger: false, connectionTimeout: 10_000,
  });
  let info: { messageId: string };
  try {
    info = await transport.sendMail({
      from: process.env.SMTP_FROM || box.user,
      to: to.valid, cc: cc.valid.length ? cc.valid : undefined, subject, text: body,
      inReplyTo: parent?.message_id, references,
    });
  } catch (err) {
    return { ok: false, error: `Gagal mengirim: ${(err as Error)?.message?.slice(0, 200) ?? "SMTP error"}` };
  }
  const sentAt = new Date();
  await db.insert(crmEmails).values({
    mailbox: box.user, message_id: info.messageId, thread_key: parent ? threadKey(info.messageId, parent.message_id, references) : info.messageId,
    in_reply_to: parent?.message_id ?? null, direction: "out", from_address: box.user, from_name: actor.userName, to_addresses: to.valid,
    cc_addresses: cc.valid, subject, body_text: body, snippet: snippet(body), sent_at: sentAt, client_id: account.id, contact_id: contact?.id ?? null,
    source: "erp", created_by_name: actor.userName,
  }).onConflictDoNothing({ target: crmEmails.message_id });
  await touchLastCommunication(account.id, sentAt);
  await logActivity("sales", "create", `Email ke ${account.name}: ${subject}`, "CRM Email");
  return { ok: true };
}

export async function listEmailTemplates(): Promise<MailTemplate[]> {
  await requireActor();
  await requireDivisionAccess("sales", "viewer");
  const rows = await db.select().from(crmEmailTemplates).orderBy(asc(crmEmailTemplates.name));
  return rows.map((r) => ({ id: r.id, name: r.name, subject: r.subject, body: r.body }));
}

export async function saveEmailTemplate(t: { id?: string; name: string; subject: string; body: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireActor();
  const actor = await requireDivisionAccess("sales");
  const name = (t.name ?? "").trim().slice(0, 120), subject = (t.subject ?? "").trim().slice(0, 300), body = (t.body ?? "").trim().slice(0, 50_000);
  if (!name || !subject || !body) return { ok: false, error: "Nama, subjek dan isi template wajib diisi." };
  if (t.id) {
    await db.update(crmEmailTemplates).set({ name, subject, body, updated_at: new Date() }).where(eq(crmEmailTemplates.id, t.id));
    return { ok: true, id: t.id };
  }
  const [row] = await db.insert(crmEmailTemplates).values({ name, subject, body, created_by_name: actor.userName }).returning({ id: crmEmailTemplates.id });
  return { ok: true, id: row.id };
}

export async function deleteEmailTemplate(id: string): Promise<{ ok: true }> {
  await requireActor();
  await requireDivisionAccess("sales");
  await db.delete(crmEmailTemplates).where(eq(crmEmailTemplates.id, id));
  return { ok: true };
}
