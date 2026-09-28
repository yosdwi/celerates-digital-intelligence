// Talent identity and deep-link grants (doc 19 §3, ADR-019 §4).
// Celerates owns: Celerates user ↔ ConForm employee link, and the grants that turn a WhatsApp reminder into a
// normal Celerates session. WhatsApp itself never authenticates anyone here, and no JID is stored.
import { createHash, randomBytes } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";

type Tx = Sql | TransactionSql;
export const GRANT_DEFAULT_TTL_SECONDS = 72 * 3600;
export const GRANT_MAX_TTL_SECONDS = 7 * 24 * 3600;
const TARGET = /^\/me(\/[A-Za-z0-9_\-/%.]*)?(\?[A-Za-z0-9_=&%.\-]*)?$/;

export type TalentLink = { id: string; user_id: string; conform_employee_id: string; nrp: string; display_name: string; created_at: Date | string };

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function activeLinkForUser(sql: Tx, userId: string): Promise<TalentLink | null> {
  const [row] = await sql<TalentLink[]>`SELECT id, user_id, conform_employee_id, nrp, display_name, created_at FROM talent_identity_links WHERE user_id=${userId} AND status='active'`;
  return row ?? null;
}

export async function activeLinksForEmployees(sql: Tx, employeeIds: string[]): Promise<Map<string, TalentLink>> {
  if (!employeeIds.length) return new Map();
  const rows = await sql<TalentLink[]>`SELECT id, user_id, conform_employee_id, nrp, display_name, created_at FROM talent_identity_links WHERE status='active' AND conform_employee_id = ANY(${employeeIds})`;
  return new Map(rows.map((r) => [r.conform_employee_id, r]));
}

export class TalentLinkError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/**
 * Link (creating if needed) a Talent account to a ConForm employee. The caller has already verified the employee
 * exists in ConForm. An existing backoffice/Owner account is never converted into a Talent account.
 */
export async function linkTalentAccount(
  sql: Sql,
  input: { email: string; conformEmployeeId: string; nrp: string; name: string; linkedBy: string },
): Promise<{ userId: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new TalentLinkError("invalid_email", "Email tidak valid.");
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${"talent-link:" + input.conformEmployeeId}, 0))`;
    const [existing] = await tx`SELECT id, account_type, is_owner, status FROM users WHERE email=${email}`;
    if (existing && (existing.account_type !== "talent" || existing.is_owner)) throw new TalentLinkError("not_talent_account", "Email ini milik akun backoffice, bukan akun Talent.");
    const [taken] = await tx`SELECT user_id FROM talent_identity_links WHERE conform_employee_id=${input.conformEmployeeId} AND status='active'`;
    if (taken && (!existing || taken.user_id !== existing.id)) throw new TalentLinkError("employee_already_linked", "Talent ini sudah terhubung ke akun lain.");
    let userId = existing?.id as string | undefined;
    let created = false;
    if (!existing) {
      const [row] = await tx`INSERT INTO users (email, full_name, status, is_owner, account_type) VALUES (${email}, ${input.name}, 'active', false, 'talent') RETURNING id`;
      userId = row.id as string;
      created = true;
    } else if (existing.status !== "active") {
      await tx`UPDATE users SET status='active' WHERE id=${existing.id}`;
    }
    const [current] = await tx`SELECT conform_employee_id FROM talent_identity_links WHERE user_id=${userId!} AND status='active'`;
    if (current && current.conform_employee_id !== input.conformEmployeeId) throw new TalentLinkError("user_already_linked", "Akun ini sudah terhubung ke Talent lain.");
    if (!current)
      await tx`INSERT INTO talent_identity_links (user_id, conform_employee_id, nrp, display_name, linked_by_user_id) VALUES (${userId!}, ${input.conformEmployeeId}, ${input.nrp}, ${input.name}, ${input.linkedBy})`;
    await tx`INSERT INTO activity_logs (division_key, action_type, entity_label, page_label, actor_user_id, actor_name) SELECT 'pmo', 'update', ${"Akun Talent terhubung: " + input.nrp}, 'Operational Readiness', id, full_name FROM users WHERE id=${input.linkedBy}`;
    return { userId: userId!, created };
  });
}

export async function revokeTalentLink(sql: Tx, userId: string): Promise<boolean> {
  const rows = await sql`UPDATE talent_identity_links SET status='revoked', revoked_at=now() WHERE user_id=${userId} AND status='active' RETURNING id`;
  return rows.length > 0;
}

/** Issue an opaque, single-use grant. Returns the code once; only its hash is stored. */
export async function issueGrant(
  sql: Tx,
  input: { userId: string; targetPath: string; purpose: "campaign" | "manual"; ttlSeconds?: number; campaignRef?: string | null; createdBy?: string | null },
): Promise<{ code: string; expiresAt: Date }> {
  if (!TARGET.test(input.targetPath)) throw new TalentLinkError("invalid_target", "Target harus di bawah /me.");
  const ttl = Math.min(Math.max(input.ttlSeconds ?? GRANT_DEFAULT_TTL_SECONDS, 300), GRANT_MAX_TTL_SECONDS);
  const code = randomBytes(32).toString("base64url");
  const [row] = await sql`INSERT INTO talent_link_grants (token_sha256, user_id, target_path, purpose, campaign_ref, created_by_user_id, expires_at)
    VALUES (${sha256(code)}, ${input.userId}, ${input.targetPath}, ${input.purpose}, ${input.campaignRef ?? null}, ${input.createdBy ?? null}, now() + make_interval(secs => ${ttl}))
    RETURNING expires_at`;
  return { code, expiresAt: new Date(row.expires_at as string | Date) };
}

const CODE = /^[A-Za-z0-9_-]{40,60}$/;

/** Look at a grant without consuming it (link previews and crawlers must never redeem one). */
export async function peekGrant(sql: Tx, code: string): Promise<{ userId: string; targetPath: string } | null> {
  if (!CODE.test(code)) return null;
  const [row] = await sql`SELECT user_id, target_path FROM talent_link_grants WHERE token_sha256=${sha256(code)} AND used_at IS NULL AND expires_at > now()`;
  return row ? { userId: row.user_id as string, targetPath: row.target_path as string } : null;
}

/**
 * Redeem atomically: one UPDATE decides. The user must still be an active Talent account with an active link;
 * otherwise nothing is consumed and no session is created.
 */
export async function redeemGrant(sql: Tx, code: string, expectUserId?: string): Promise<{ userId: string; email: string; name: string; targetPath: string } | null> {
  if (!CODE.test(code)) return null;
  const [row] = await sql`
    UPDATE talent_link_grants g SET used_at = now()
    FROM users u
    WHERE g.token_sha256=${sha256(code)} AND g.used_at IS NULL AND g.expires_at > now()
      AND u.id = g.user_id AND u.status='active' AND u.account_type='talent' AND u.is_owner = false
      AND (${expectUserId ?? null}::uuid IS NULL OR g.user_id = ${expectUserId ?? null}::uuid)
      AND EXISTS (SELECT 1 FROM talent_identity_links l WHERE l.user_id=u.id AND l.status='active')
    RETURNING g.user_id, g.target_path, u.email, u.full_name`;
  return row ? { userId: row.user_id as string, email: row.email as string, name: row.full_name as string, targetPath: row.target_path as string } : null;
}
