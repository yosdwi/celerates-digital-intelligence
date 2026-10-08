// Reads the pilot mailbox (SMTP_USER, the account OTP mail already uses) over IMAP and keeps the messages that belong
// to an Account (CRM) in crm_emails. INBOX and Sent, each from where the last run stopped (mail_sync_state); the first
// run looks back 30 days. Mail that matches no account is not stored. Started from instrumentation.ts.
import { readFileSync } from "node:fs";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { db } from "@/db";
import { crmClientContacts, crmEmails, mailSyncState } from "@/db/schema";
import { domainOf, htmlToText, matchAccount, normAddress, snippet, threadKey } from "./model";

const FIRST_RUN_DAYS = 30;
const PER_FOLDER = 200; // ponytail: a backlog drains 200 messages per folder per run; fine for one pilot mailbox.
const INTERVAL_MS = 2 * 60_000;

export function mailbox() {
  const user = process.env.SMTP_USER;
  const file = process.env.SMTP_PASSWORD_FILE;
  const pass = process.env.SMTP_PASSWORD || (file ? readFileSync(file, "utf8").trim() : "");
  return user && pass ? { user: normAddress(user), pass, host: process.env.IMAP_HOST || "imap.gmail.com" } : null;
}

/** Our side of a conversation: the mailbox's domain and the Sales team's (MAIL_OWN_DOMAINS, default celerates.co.id). */
export function ownDomains(user: string) {
  return new Set([domainOf(user), ...(process.env.MAIL_OWN_DOMAINS || "celerates.co.id").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)]);
}

const addresses = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value).map((v) => v.address).filter((v): v is string => !!v).map(normAddress);

let running: Promise<{ stored: number }> | null = null;

/** One sync run; concurrent callers share it. */
export function syncMailbox(): Promise<{ stored: number }> {
  running ??= run().finally(() => { running = null; });
  return running;
}

async function run(): Promise<{ stored: number }> {
  const box = mailbox();
  if (!box) return { stored: 0 };
  const own = ownDomains(box.user);
  const contacts = (await db.select({ id: crmClientContacts.id, clientId: crmClientContacts.client_id, email: crmClientContacts.email })
    .from(crmClientContacts).where(isNotNull(crmClientContacts.email)));
  const client = new ImapFlow({ host: box.host, port: 993, secure: true, auth: { user: box.user, pass: box.pass }, logger: false });
  let stored = 0;
  try {
    await client.connect();
  } catch (err) {
    await saveState(box.user, "INBOX", { last_error: `Login IMAP gagal: ${(err as Error)?.message?.slice(0, 200) ?? ""}` });
    throw err;
  }
  try {
    const sent = (await client.list()).find((f) => f.specialUse === "\\Sent")?.path;
    for (const folder of ["INBOX", ...(sent ? [sent] : [])]) {
      try {
        stored += await syncFolder(client, box.user, folder, own, contacts);
      } catch (err) {
        await saveState(box.user, folder, { last_error: (err as Error)?.message?.slice(0, 300) ?? "sync gagal" });
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { stored };
}

async function saveState(user: string, folder: string, patch: Partial<typeof mailSyncState.$inferInsert>) {
  await db.insert(mailSyncState).values({ mailbox: user, folder, ...patch })
    .onConflictDoUpdate({ target: [mailSyncState.mailbox, mailSyncState.folder], set: patch });
}

async function syncFolder(client: ImapFlow, user: string, folder: string, own: Set<string>, contacts: { id: string; clientId: string; email: string | null }[]) {
  const lock = await client.getMailboxLock(folder);
  try {
    const status = client.mailbox;
    const uidValidity = status ? Number(status.uidValidity) : 0;
    const [state] = await db.select().from(mailSyncState).where(and(eq(mailSyncState.mailbox, user), eq(mailSyncState.folder, folder)));
    const fresh = !state || state.uid_validity !== uidValidity;
    const after = fresh ? 0 : state.last_uid;
    const found = fresh
      ? await client.search({ since: new Date(Date.now() - FIRST_RUN_DAYS * 86_400_000) }, { uid: true })
      : await client.search({ uid: `${after + 1}:*` }, { uid: true });
    // `n:*` always returns the newest message even when nothing is new.
    const uids = (found || []).filter((u) => u > after).sort((a, b) => a - b).slice(0, PER_FOLDER);
    let stored = 0;
    let last = after;
    if (uids.length) {
      for await (const msg of client.fetch(uids.join(","), { uid: true, source: true }, { uid: true })) {
        last = Math.max(last, msg.uid);
        if (!msg.source) continue;
        const m = await simpleParser(msg.source);
        const from = m.from?.value[0];
        if (!from?.address) continue;
        const to = addresses(m.to), cc = addresses(m.cc);
        const hit = matchAccount([from.address, ...to, ...cc], contacts, own);
        if (!hit) continue;
        const messageId = m.messageId || `<${uidValidity}.${msg.uid}.${folder}@${user}>`;
        const body = (m.text || (m.html ? htmlToText(m.html) : "")).slice(0, 100_000);
        const sentAt = m.date ?? new Date();
        const [row] = await db.insert(crmEmails).values({
          mailbox: user, message_id: messageId, thread_key: threadKey(messageId, m.inReplyTo, m.references), in_reply_to: m.inReplyTo ?? null,
          direction: own.has(domainOf(from.address)) ? "out" : "in", from_address: normAddress(from.address), from_name: from.name || null,
          to_addresses: to, cc_addresses: cc, subject: m.subject ?? "", body_text: body, snippet: snippet(body), sent_at: sentAt,
          client_id: hit.clientId, contact_id: hit.contactId, source: "imap",
        }).onConflictDoNothing({ target: crmEmails.message_id }).returning({ id: crmEmails.id });
        if (row) { stored++; await touchLastCommunication(hit.clientId, sentAt); }
      }
    }
    await saveState(user, folder, { uid_validity: uidValidity, last_uid: last, last_synced_at: new Date(), last_error: null });
    return stored;
  } finally {
    lock.release();
  }
}

/** Mail with a client moves its opportunities' Last Communication forward (never back). */
export async function touchLastCommunication(clientId: string, at: Date) {
  const day = at.toISOString().slice(0, 10);
  await db.execute(sql`UPDATE sales_opportunity_trackers SET last_communication_date = ${day}
    WHERE client_name = (SELECT name FROM crm_clients WHERE id = ${clientId})
      AND (last_communication_date IS NULL OR last_communication_date < ${day})`);
}

/** Every two minutes while the server runs (instrumentation.ts); MAIL_SYNC=off turns it off. */
export function startMailSync() {
  const g = globalThis as { __mailSync?: boolean };
  if (g.__mailSync || process.env.MAIL_SYNC === "off" || !mailbox()) return;
  g.__mailSync = true;
  const tick = () => syncMailbox().catch((err) => console.error("mail sync:", (err as Error)?.message ?? err));
  setTimeout(tick, 20_000);
  setInterval(tick, INTERVAL_MS).unref();
}
