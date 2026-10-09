"use server";
import { currentClaims, requestMeta, requireActor, requireRecentAuth, StepUpRequiredError } from "@/lib/actor";
import { db, sql } from "@/db";
import { mailboxAllowed } from "@/lib/security/email-otp";
import { inviteMail } from "@/lib/invite-mail";
import { audit } from "@/lib/security/audit";
import { CAPABILITIES, type Capability, type CapabilityScope } from "@/lib/security/policy";
import { revokeUserSessions } from "@/lib/security/session";
import { revokeTalentLink } from "@/lib/talent/identity";
import { users, userAccess, divisions, googleTokens, sheetConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { formatDbError } from "@/lib/db-error";

async function requireOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !(session.user as any).isOwner) {
    throw new Error("Cuma Owner yang boleh melakukan ini");
  }
  return session.user as any;
}

/** Owner ATAU Backoffice dengan akses divisi "pmo" level "full" -- dipakai khusus buat
 * kurasi akses Timesheet Converter per Talent (bukan cuma Owner, PMO full juga boleh). */
async function requireOwnerOrPmoFull() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user) throw new Error("Sesi tidak valid, silakan login ulang");
  if (user.isOwner) return user;

  const access = (user.access ?? []) as { divisionKey: string; level: string }[];
  const hasPmoFull = access.some((a) => a.divisionKey === "pmo" && a.level === "full");
  if (!hasPmoFull) throw new Error("Cuma Owner atau PMO (akses Full) yang boleh melakukan ini");
  return user;
}

/** R7.4: every access change is in the sensitive access log (who, whom, what), never only in free-text activity. */
async function auditAccess(action: string, subjectUserId: string, reason?: string) {
  const claims = await currentClaims();
  await audit(sql, { action, decision: "allow", actorUserId: claims?.userId ?? null, sessionId: claims?.sid ?? null, resourceType: "user",
    resourceId: subjectUserId, subjectUserId, reason: reason ?? null, ...(await requestMeta()) });
}

export async function approveUser(userId: string) {
  await requireActor();

  const owner = await requireOwner();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User tidak ditemukan");

  await db.update(users).set({ status: "active" }).where(eq(users.id, userId));

  if (user.requested_division_id) {
    await db.insert(userAccess).values({
      user_id: userId,
      division_id: user.requested_division_id,
      level: "viewer",
      granted_by_user_id: owner.id,
    }).onConflictDoNothing();
  }
  await auditAccess("user_approve", userId);

  revalidatePath("/access-management");
}

export async function rejectUser(userId: string) {
  await requireActor();

  await requireOwner();
  await db.update(users).set({ status: "rejected" }).where(eq(users.id, userId));
  await revokeUserSessions(sql, userId, "user_rejected", { browsers: true });
  await auditAccess("user_reject", userId);
  revalidatePath("/access-management");
}

export async function setUserAccess(userId: string, divisionId: string, level: string) {
  await requireActor();

  const owner = await requireOwner();

  if (level === "none") {
    await db.delete(userAccess).where(and(eq(userAccess.user_id, userId), eq(userAccess.division_id, divisionId)));
  } else {
    const [existing] = await db.select().from(userAccess).where(and(eq(userAccess.user_id, userId), eq(userAccess.division_id, divisionId)));
    if (existing) {
      await db.update(userAccess).set({ level }).where(eq(userAccess.id, existing.id));
    } else {
      await db.insert(userAccess).values({ user_id: userId, division_id: divisionId, level, granted_by_user_id: owner.id });
    }
  }
  const [division] = await db.select({ key: divisions.key }).from(divisions).where(eq(divisions.id, divisionId));
  await auditAccess("division_access_set", userId, `${division?.key ?? divisionId}:${level}`);

  revalidatePath("/access-management");
}

export async function toggleOwner(userId: string, isOwner: boolean): Promise<InviteResult> {
  await requireActor();

  await requireOwner();
  // Making someone Owner is an access grant: it needs a fresh step-up (docs/security/03).
  if (isOwner) {
    try {
      await requireRecentAuth("access.admin");
    } catch (error) {
      if (error instanceof StepUpRequiredError) return { ok: false, error: "step_up_required" };
      throw error;
    }
  }
  await db.update(users).set({ is_owner: isOwner }).where(eq(users.id, userId));
  await auditAccess(isOwner ? "owner_grant" : "owner_revoke", userId);
  revalidatePath("/access-management");
  return { ok: true };
}

/**
 * Kurasi per-Talent apakah boleh pakai Timesheet Converter (client Astra dkk).
 * Cuma relevan untuk user account_type "talent" -- dibiarkan bisa dipanggil ke
 * user backoffice juga (kolomnya memang ada di semua baris users), tapi UI
 * cuma menampilkan toggle ini untuk baris Talent.
 */
export async function toggleTimesheetConverterAccess(userId: string, enabled: boolean) {
  await requireActor();

  await requireOwnerOrPmoFull();
  await db.update(users).set({ can_use_timesheet_converter: enabled }).where(eq(users.id, userId));
  await auditAccess("timesheet_converter_set", userId, String(enabled));
  revalidatePath("/access-management");
}

export async function createDivision(formData: FormData) {
  await requireActor();

  await requireOwner();
  const name = formData.get("name") as string;
  const key = formData.get("key") as string;
  if (!name || !key) throw new Error("Nama dan key wajib diisi");

  try {
    await db.insert(divisions).values({ name, key: key.toLowerCase().replace(/\s+/g, "_") });
  } catch (e) {
    throw new Error(formatDbError(e, { entityLabel: "Divisi dengan key ini" }));
  }
  revalidatePath("/access-management");
}

export type InviteResult = { ok: true } | { ok: false; error: string };

const LEVEL_LABEL: Record<string, string> = { viewer: "Viewer", editor: "Editor", full: "Full" };
export type InviteOutcome = { ok: true; email: string; mailed: boolean } | { ok: false; email?: string; error: string };

/** One invitation: the account (active, no password yet), its division access, the audit row, then the email. */
async function inviteOne(owner: { id: string; fullName?: string; name?: string | null; email?: string | null },
  input: { email: string; full_name: string; division_id: string; level: string; make_owner: boolean }): Promise<InviteOutcome> {
  const email = input.email.trim().toLowerCase();
  const full_name = input.full_name.trim();
  if (!email || !full_name) return { ok: false, email, error: "Email dan nama wajib diisi" };
  if (!mailboxAllowed(email).ok) return { ok: false, email, error: "Gunakan email perusahaan @celerates.com atau @celerates.co.id" };
  if (!input.make_owner && (!input.division_id || !LEVEL_LABEL[input.level])) return { ok: false, email, error: "Pilih divisi dan level akses (atau centang jadikan Owner)" };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return { ok: false, email, error: "Email ini sudah terdaftar" };
  const [division] = input.make_owner ? [] : await db.select({ name: divisions.name }).from(divisions).where(eq(divisions.id, input.division_id));
  if (!input.make_owner && !division) return { ok: false, email, error: "Divisi tidak ditemukan" };

  const [newUser] = await db.insert(users).values({ email, full_name, status: "active", is_owner: input.make_owner }).returning();
  if (!input.make_owner) {
    await db.insert(userAccess).values({ user_id: newUser.id, division_id: input.division_id, level: input.level, granted_by_user_id: owner.id });
  }
  await auditAccess("user_invite", newUser.id, input.make_owner ? "owner" : input.level);

  // The invited person sets a password with an email code ("Aktivasi akun / lupa password" on /login).
  const access = input.make_owner ? "Owner" : `${division!.name} · ${LEVEL_LABEL[input.level]}`;
  const mailed = await inviteMail.send({ to: email, name: full_name, inviter: owner.fullName ?? owner.name ?? owner.email ?? "Admin Celerates", access })
    .then(() => true, () => false);
  return { ok: true, email, mailed };
}

export async function inviteUser(formData: FormData): Promise<InviteOutcome> {
  await requireActor();
  const owner = await requireOwner();
  const out = await inviteOne(owner, {
    email: String(formData.get("email") ?? ""), full_name: String(formData.get("full_name") ?? ""),
    division_id: String(formData.get("division_id") ?? ""), level: String(formData.get("level") ?? ""), make_owner: formData.get("make_owner") === "on",
  });
  revalidatePath("/access-management");
  return out;
}

/**
 * Many invitations at once: one line per person, "email, nama" or "email, nama, level" (comma, semicolon or tab).
 * Every line goes to the chosen division; a line's own level overrides the default. At most 50 lines.
 */
export async function inviteUsersBulk(formData: FormData): Promise<InviteOutcome[]> {
  await requireActor();
  const owner = await requireOwner();
  const division_id = String(formData.get("division_id") ?? "");
  const defaultLevel = String(formData.get("level") ?? "");
  const lines = String(formData.get("lines") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 50) return [{ ok: false, error: "Maksimal 50 baris sekali kirim." }];
  const out: InviteOutcome[] = [];
  for (const line of lines) {
    const [email = "", full_name = "", level = ""] = line.split(/[,;\t]/).map((p) => p.trim());
    out.push(await inviteOne(owner, { email, full_name, division_id, level: (level || defaultLevel).toLowerCase(), make_owner: false }));
  }
  revalidatePath("/access-management");
  return out;
}

/** Send the invitation again to an account that has not set a password yet. */
export async function resendInvite(userId: string): Promise<InviteResult> {
  await requireActor();
  const owner = await requireOwner();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.status !== "active" || u.password_hash || u.account_type === "talent") return { ok: false, error: "Akun ini sudah aktif atau tidak bisa diundang." };
  const rows = await db.select({ name: divisions.name, level: userAccess.level }).from(userAccess).innerJoin(divisions, eq(divisions.id, userAccess.division_id)).where(eq(userAccess.user_id, userId));
  const access = u.is_owner ? "Owner" : rows.map((r) => `${r.name} · ${LEVEL_LABEL[r.level] ?? r.level}`).join(", ") || "Celerates ERP";
  try {
    await inviteMail.send({ to: u.email, name: u.full_name, inviter: (owner as { fullName?: string }).fullName ?? "Admin Celerates", access });
  } catch {
    return { ok: false, error: "Email undangan gagal terkirim. Coba lagi nanti." };
  }
  await auditAccess("user_invite_resend", userId);
  return { ok: true };
}

export async function deleteUser(userId: string): Promise<InviteResult> {
  await requireActor();

  const owner = await requireOwner();
  if (userId === owner.id) {
    return { ok: false, error: "Tidak bisa menghapus akun sendiri" };
  }

  // Permanent delete is for an account with no history (e.g. invited by mistake). Anything that has been used is
  // referenced by logs, timesheets, approvals and more, and must be deactivated instead (QA doc page 14, 2026-10-09).
  // One transaction: either the account and its own rows go, or nothing changes.
  try {
    await db.transaction(async (tx) => {
      await tx.delete(userAccess).where(eq(userAccess.user_id, userId));
      await tx.delete(googleTokens).where(eq(googleTokens.user_id, userId));
      await tx.update(sheetConnections).set({ connected_by_user_id: null }).where(eq(sheetConnections.connected_by_user_id, userId));
      await tx.delete(users).where(eq(users.id, userId));
    });
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "23503") return { ok: false, error: "Akun ini sudah punya riwayat (aktivitas, notifikasi, timesheet, atau lainnya), jadi tidak bisa dihapus permanen. Pakai Nonaktifkan: akses langsung berhenti dan riwayatnya tetap utuh." };
    return { ok: false, error: "Akun gagal dihapus. Coba lagi atau nonaktifkan saja." };
  }
  await auditAccess("user_delete", userId);
  revalidatePath("/access-management");
  return { ok: true };
}

export async function updateUserInfo(userId: string, formData: FormData): Promise<InviteResult> {
  await requireActor();

  await requireOwner();
  const full_name = formData.get("full_name") as string;
  const role_title = formData.get("role_title") as string;

  if (!full_name) return { ok: false, error: "Nama wajib diisi" };

  await db.update(users).set({ full_name, role_title: role_title || null }).where(eq(users.id, userId));
  revalidatePath("/access-management");
  return { ok: true };
}

/**
 * Offboarding (docs/security/02 R6.2): one immediate, reversible step. Status inactive, every session and trusted
 * browser revoked, Talent link and pending grants ended. Access rows stay for history and are ignored while inactive.
 */
export async function deactivateUser(userId: string): Promise<InviteResult> {
  await requireActor();

  const owner = await requireOwner();
  if (userId === owner.id) return { ok: false, error: "Tidak bisa menonaktifkan akun sendiri" };
  const revoked = await sql.begin(async (tx) => {
    await tx`UPDATE users SET status = 'inactive' WHERE id = ${userId}`;
    const count = await revokeUserSessions(tx, userId, "user_deactivated", { browsers: true });
    await tx`UPDATE talent_link_grants SET superseded_at = now() WHERE user_id = ${userId} AND superseded_at IS NULL`;
    await revokeTalentLink(tx, userId);
    return count;
  });
  await auditAccess("user_deactivate", userId, `sessions_revoked:${revoked}`);
  revalidatePath("/access-management");
  return { ok: true };
}

export async function reactivateUser(userId: string): Promise<InviteResult> {
  await requireActor();

  await requireOwner();
  await db.update(users).set({ status: "active" }).where(eq(users.id, userId));
  await auditAccess("user_reactivate", userId);
  revalidatePath("/access-management");
  return { ok: true };
}

/** Lost device or suspected misuse: end every session of this user and forget their trusted browsers. */
export async function signOutUserEverywhere(userId: string): Promise<InviteResult> {
  await requireActor();

  await requireOwner();
  const count = await revokeUserSessions(sql, userId, "revoked_by_owner", { browsers: true });
  await auditAccess("session_revoke_all", userId, `sessions_revoked:${count}`);
  return { ok: true };
}

/** Sensitivity capability grant (docs/security/03). Owner (implicit access.admin) + fresh step-up; audited. */
export async function grantCapability(userId: string, capability: string, scope: string, reason: string): Promise<InviteResult> {
  await requireActor();

  let claims;
  try {
    claims = await requireRecentAuth("access.admin");
  } catch (error) {
    if (error instanceof StepUpRequiredError) return { ok: false, error: "step_up_required" };
    throw error;
  }
  if (!CAPABILITIES.includes(capability as Capability)) return { ok: false, error: "Capability tidak dikenal" };
  if (!["all", "onboarding", "employee"].includes(scope)) return { ok: false, error: "Scope tidak dikenal" };
  if (capability === "access.admin" && !claims.isOwner) return { ok: false, error: "Hanya Owner yang dapat memberi access.admin" };
  const why = reason.trim();
  if (why.length < 3 || why.length > 300) return { ok: false, error: "Alasan wajib diisi (3–300 karakter)" };
  const [target] = await sql`SELECT account_type, status FROM users WHERE id = ${userId}`;
  if (!target || target.account_type === "talent") return { ok: false, error: "Capability hanya untuk akun backoffice" };
  const inserted = await sql`INSERT INTO user_capabilities (user_id, capability, scope, reason, granted_by)
    VALUES (${userId}, ${capability}, ${scope as CapabilityScope}, ${why}, ${claims.userId})
    ON CONFLICT (user_id, capability) WHERE revoked_at IS NULL DO NOTHING RETURNING id`;
  if (!inserted.length) return { ok: false, error: "Capability ini sudah aktif untuk pengguna tersebut" };
  await audit(sql, { action: "capability_grant", decision: "allow", actorUserId: claims.userId, sessionId: claims.sid, resourceType: "user_capability",
    resourceId: inserted[0].id, subjectUserId: userId, reason: `${capability}:${scope}`, stepUpAt: claims.stepUpAt, ...(await requestMeta()) });
  revalidatePath("/access-management");
  return { ok: true };
}

export async function revokeCapability(grantId: string): Promise<InviteResult> {
  await requireActor();

  const owner = await requireOwner();
  const rows = await sql`UPDATE user_capabilities SET revoked_at = now(), revoked_by = ${owner.id}
    WHERE id = ${grantId} AND revoked_at IS NULL RETURNING user_id, capability`;
  if (!rows.length) return { ok: false, error: "Capability tidak ditemukan" };
  const claims = await currentClaims();
  await audit(sql, { action: "capability_revoke", decision: "allow", actorUserId: owner.id, sessionId: claims?.sid ?? null, resourceType: "user_capability",
    resourceId: grantId, subjectUserId: rows[0].user_id, reason: rows[0].capability, ...(await requestMeta()) });
  revalidatePath("/access-management");
  return { ok: true };
}
