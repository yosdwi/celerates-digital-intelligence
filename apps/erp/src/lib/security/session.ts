// Server-side revocable sessions (docs/security/02). The NextAuth cookie carries only `sid`; every protected request
// re-reads the session row and the user from PostgreSQL, so revocation, deactivation and access changes apply on
// the next request. Trusted browsers let a backoffice user skip the email code on a browser that already proved
// the mailbox. Only SHA-256 of browser tokens is stored.
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import type { CapabilityGrant } from "./policy";

type Tx = Sql | TransactionSql;

/** Proposals from the review (§6), business sign-off pending: daily work never asks for email. */
export const SESSION_POLICY = {
  backoffice: { idleSeconds: 7 * 86_400, absoluteSeconds: 30 * 86_400 },
  talent: { idleSeconds: 30 * 86_400, absoluteSeconds: 90 * 86_400 },
} as const;
export const TRUSTED_BROWSER_SECONDS = 30 * 86_400;
const TOUCH_AFTER_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuthMethod = "password" | "password+email_otp" | "talent_link" | "passkey";
export type SessionClaims = {
  sid: string;
  userId: string;
  email: string;
  fullName: string;
  status: string;
  isOwner: boolean;
  accountType: string;
  canUseTimesheetConverter: boolean;
  hasRequestedDivision: boolean;
  googleLinked: boolean;
  access: { divisionKey: string; level: string }[];
  capabilities: CapabilityGrant[];
  authMethod: AuthMethod;
  stepUpAt: Date | null;
};

const policyFor = (accountType: string) => SESSION_POLICY[accountType === "talent" ? "talent" : "backoffice"];
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createSession(
  sql: Tx,
  input: { userId: string; method: AuthMethod; trustedBrowserId?: string | null; stepUp?: boolean; device?: string | null; ipPrefix?: string | null },
): Promise<string> {
  const [user] = await sql`SELECT account_type FROM users WHERE id=${input.userId} AND status='active'`;
  if (!user) throw new Error("inactive user");
  const p = policyFor(user.account_type);
  const [row] = await sql`
    INSERT INTO auth_sessions (user_id, auth_method, trusted_browser_id, step_up_at, idle_expires_at, absolute_expires_at, device, ip_prefix)
    VALUES (${input.userId}, ${input.method}, ${input.trustedBrowserId ?? null}, ${input.stepUp ? sql`now()` : null},
            now() + make_interval(secs => ${p.idleSeconds}), now() + make_interval(secs => ${p.absoluteSeconds}),
            ${input.device ?? null}, ${input.ipPrefix ?? null})
    RETURNING id`;
  return row.id as string;
}

/** The live session and fresh claims, or null when the session is unknown, revoked, expired or the user inactive. */
export async function loadSession(sql: Tx, sid: unknown): Promise<SessionClaims | null> {
  if (typeof sid !== "string" || !UUID.test(sid)) return null;
  const [row] = await sql`
    SELECT s.id, s.user_id, s.auth_method, s.step_up_at, s.last_seen_at, s.absolute_expires_at,
           u.email, u.full_name, u.status, u.is_owner, u.account_type, u.can_use_timesheet_converter,
           u.requested_division_id IS NOT NULL AS has_requested_division, u.google_sub IS NOT NULL AS google_linked,
           COALESCE((SELECT json_agg(json_build_object('divisionKey', d.key, 'level', ua.level) ORDER BY d.key)
                     FROM user_access ua JOIN divisions d ON d.id = ua.division_id WHERE ua.user_id = u.id), '[]'::json) AS access,
           COALESCE((SELECT json_agg(json_build_object('capability', c.capability, 'scope', c.scope) ORDER BY c.capability)
                     FROM user_capabilities c WHERE c.user_id = u.id AND c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > now())), '[]'::json) AS capabilities
    FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sid} AND s.revoked_at IS NULL AND s.idle_expires_at > now() AND s.absolute_expires_at > now() AND u.status = 'active'`;
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_AFTER_MS) {
    await sql`UPDATE auth_sessions SET last_seen_at = now(),
      idle_expires_at = LEAST(now() + make_interval(secs => ${policyFor(row.account_type).idleSeconds}), absolute_expires_at)
      WHERE id = ${sid} AND revoked_at IS NULL`;
  }
  const json = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
  return {
    sid: row.id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    isOwner: row.is_owner === true,
    accountType: row.account_type ?? "backoffice",
    canUseTimesheetConverter: row.can_use_timesheet_converter === true,
    hasRequestedDivision: row.has_requested_division === true,
    googleLinked: row.google_linked === true,
    access: json(row.access),
    capabilities: json(row.capabilities),
    authMethod: row.auth_method,
    stepUpAt: row.step_up_at ? new Date(row.step_up_at) : null,
  };
}

/** Revoke one session; with `userId`, only if it belongs to that user (a user revoking their own device). */
export async function revokeSession(sql: Tx, sid: string, reason: string, userId?: string): Promise<boolean> {
  if (!UUID.test(sid)) return false;
  const rows = await sql`UPDATE auth_sessions SET revoked_at = now(), revoke_reason = ${reason}
    WHERE id = ${sid} AND revoked_at IS NULL AND (${userId ?? null}::uuid IS NULL OR user_id = ${userId ?? null}::uuid) RETURNING id`;
  return rows.length > 0;
}

/** Revoke every open session of a user (optionally keeping one) and, when asked, every trusted browser. */
export async function revokeUserSessions(sql: Tx, userId: string, reason: string, opts: { exceptSid?: string | null; browsers?: boolean } = {}): Promise<number> {
  const rows = await sql`UPDATE auth_sessions SET revoked_at = now(), revoke_reason = ${reason}
    WHERE user_id = ${userId} AND revoked_at IS NULL AND id IS DISTINCT FROM ${opts.exceptSid ?? null}::uuid RETURNING id`;
  if (opts.browsers) await sql`UPDATE auth_trusted_browsers SET revoked_at = now(), revoke_reason = ${reason} WHERE user_id = ${userId} AND revoked_at IS NULL`;
  return rows.length;
}

export async function listSessions(sql: Tx, userId: string) {
  return sql<{ id: string; auth_method: string; created_at: Date; last_seen_at: Date; device: string | null; ip_prefix: string | null }[]>`
    SELECT id, auth_method, created_at, last_seen_at, device, ip_prefix FROM auth_sessions
    WHERE user_id = ${userId} AND revoked_at IS NULL AND idle_expires_at > now() AND absolute_expires_at > now()
    ORDER BY last_seen_at DESC LIMIT 50`;
}

export async function markStepUp(sql: Tx, sid: string): Promise<void> {
  await sql`UPDATE auth_sessions SET step_up_at = now() WHERE id = ${sid} AND revoked_at IS NULL`;
}

export async function createTrustedBrowser(sql: Tx, userId: string, device: string | null): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString("base64url");
  const [row] = await sql`INSERT INTO auth_trusted_browsers (user_id, token_sha256, device, expires_at)
    VALUES (${userId}, ${sha256(token)}, ${device}, now() + make_interval(secs => ${TRUSTED_BROWSER_SECONDS})) RETURNING id`;
  return { id: row.id as string, token };
}

/**
 * The trusted browser when this browser token is valid for this user, else null. `fresh`: this is its first use,
 * within 10 minutes of the email code that created it, i.e. the sign-in that code was for. Every later use is not.
 */
export async function findTrustedBrowser(sql: Tx, userId: string, token: string | null | undefined): Promise<{ id: string; fresh: boolean } | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await sql`UPDATE auth_trusted_browsers t SET last_used_at = now()
    FROM (SELECT id, last_used_at = created_at AND created_at > now() - interval '10 minutes' AS fresh FROM auth_trusted_browsers
          WHERE token_sha256 = ${sha256(token)} AND user_id = ${userId} AND revoked_at IS NULL AND expires_at > now() FOR UPDATE) o
    WHERE t.id = o.id
    RETURNING t.id, o.fresh`;
  return row ? { id: row.id as string, fresh: row.fresh === true } : null;
}

export async function revokeTrustedBrowser(sql: Tx, userId: string, id: string, reason: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await sql`UPDATE auth_trusted_browsers SET revoked_at = now(), revoke_reason = ${reason} WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL RETURNING id`;
  return rows.length > 0;
}

export async function listTrustedBrowsers(sql: Tx, userId: string) {
  return sql<{ id: string; device: string | null; created_at: Date; last_used_at: Date; expires_at: Date }[]>`
    SELECT id, device, created_at, last_used_at, expires_at FROM auth_trusted_browsers
    WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > now() ORDER BY last_used_at DESC LIMIT 50`;
}

// ---- request metadata: only coarse, non-identifying summaries are stored ----

export const TRUSTED_BROWSER_COOKIE = (process.env.NEXTAUTH_URL ?? "").startsWith("https://") ? "__Host-erp-tb" : "erp-tb";

export function clientMeta(headers: Headers | Record<string, string | string[] | undefined>) {
  const get = (name: string) => {
    const v = headers instanceof Headers ? headers.get(name) : headers[name];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const ip = (get("cf-connecting-ip") || get("x-forwarded-for").split(",")[0] || get("x-real-ip")).trim().slice(0, 64);
  const ua = get("user-agent");
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ua ? "Browser lain" : "Tidak diketahui";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const ipPrefix = /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip.replace(/\.\d+$/, ".0/24") : ip.includes(":") ? ip.split(":").slice(0, 3).join(":") + "::/48" : null;
  const ipHash = ip ? createHmac("sha256", process.env.NEXTAUTH_SECRET || "dev").update("ip:" + ip).digest("hex").slice(0, 16) : null;
  return { ip, device: os ? `${browser} · ${os}` : browser, ipPrefix, ipHash, cookie: get("cookie") };
}

export function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
