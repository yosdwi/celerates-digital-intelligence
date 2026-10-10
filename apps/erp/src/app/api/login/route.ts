// Backoffice sign-in steps before NextAuth issues the session (docs/security/02):
//   start         email + password → "signin" (trusted browser / Talent / codes off) or "otp" (code emailed)
//   verify        email + code     → this browser becomes trusted (HttpOnly cookie) → client calls signIn()
//   reset-start   email            → code emailed when the account may use it (same answer either way)
//   reset-verify  email + code + new password → password set, every session and trusted browser revoked
// signIn("credentials") still re-checks the password and requires the trusted browser, so nothing here grants
// a session on its own. Codes are never logged or returned.
import bcrypt from "bcryptjs";
import { sql } from "@/db";
import { checkPassword } from "@/lib/auth";
import { allowAttempt } from "@/lib/login-throttle";
import { audit } from "@/lib/security/audit";
import { issueChallenge, mail, mailboxAllowed, otpRequiredFor, verifyChallenge, type OtpPurpose } from "@/lib/security/email-otp";
import { revokeAllPasskeys } from "@/lib/security/passkey";
import {
  clientMeta, createTrustedBrowser, findTrustedBrowser, readCookie, revokeUserSessions, TRUSTED_BROWSER_COOKIE, TRUSTED_BROWSER_SECONDS,
} from "@/lib/security/session";

export const dynamic = "force-dynamic";
type Meta = ReturnType<typeof clientMeta>;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(process.env.NEXTAUTH_URL || request.url).host;
  } catch {
    return false;
  }
}

function trustCookie(token: string) {
  const secure = TRUSTED_BROWSER_COOKIE.startsWith("__Host-") ? "; Secure" : "";
  return `${TRUSTED_BROWSER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TRUSTED_BROWSER_SECONDS}${secure}`;
}

async function backofficeUser(email: unknown) {
  if (typeof email !== "string" || email.length > 254) return null;
  const [user] = await sql`SELECT id, email, account_type FROM users WHERE email = ${email.trim().toLowerCase()} AND status = 'active'`;
  return user && user.account_type !== "talent" ? (user as { id: string; email: string }) : null;
}

/** Issue and email a code. Returns an error code, or null when sent. */
async function sendCode(user: { id: string; email: string }, purpose: OtpPurpose, meta: Meta): Promise<string | null> {
  const box = mailboxAllowed(user.email);
  if (!box.ok) {
    await audit(sql, { action: `otp_${purpose}_send`, decision: "deny", actorUserId: user.id, reason: "mailbox_not_allowed", ipHash: meta.ipHash, device: meta.device });
    return "mailbox_not_allowed";
  }
  if (!(await allowAttempt(sql, "otp-send:" + user.id, 5)) || !(await allowAttempt(sql, "otp-send-ip:" + meta.ip, 20))) {
    await audit(sql, { action: `otp_${purpose}_send`, decision: "deny", actorUserId: user.id, reason: "rate_limited", ipHash: meta.ipHash, device: meta.device });
    return "rate_limited";
  }
  const { code } = await issueChallenge(sql, { userId: user.id, purpose });
  try {
    await mail.send(user.email, code, purpose);
  } catch (error) {
    console.error("[auth] code delivery failed", (error as { code?: string }).code ?? (error as Error).message?.slice(0, 80));
    await audit(sql, { action: `otp_${purpose}_send`, decision: "deny", actorUserId: user.id, reason: "delivery_failed", ipHash: meta.ipHash, device: meta.device });
    return "mail_unavailable";
  }
  await audit(sql, { action: `otp_${purpose}_send`, decision: "allow", actorUserId: user.id, reason: box.exception ? "mailbox_exception" : "corporate_mailbox", ipHash: meta.ipHash, device: meta.device });
  return null;
}

async function checkCode(user: { id: string } | null, purpose: OtpPurpose, code: unknown, meta: Meta) {
  if (!(await allowAttempt(sql, "otp-verify-ip:" + meta.ip, 30))) return false;
  const result = user ? await verifyChallenge(sql, { userId: user.id, purpose, code: String(code ?? "") }) : { ok: false as const };
  await audit(sql, { action: `otp_${purpose}_verify`, decision: result.ok ? "allow" : "deny", actorUserId: user?.id ?? null,
    reason: result.ok ? result.delivery : "invalid_or_expired", ipHash: meta.ipHash, device: meta.device });
  return result.ok;
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "forbidden" }, 403);
  const meta = clientMeta(request.headers);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  switch (body.action) {
    case "start": {
      const user = await checkPassword(body.email, body.password, meta);
      if (!user) return json({ error: "invalid_credentials" }, 401);
      if (user.account_type !== "talent" && !mailboxAllowed(user.email).ok) {
        await audit(sql, { action: "login", decision: "deny", actorUserId: user.id, reason: "mailbox_not_allowed", ipHash: meta.ipHash, device: meta.device });
        return json({ error: "mailbox_not_allowed" }, 403);
      }
      if (user.account_type === "talent" || !otpRequiredFor(user)) return json({ next: "signin" });
      if (await findTrustedBrowser(sql, user.id, readCookie(meta.cookie, TRUSTED_BROWSER_COOKIE))) return json({ next: "signin" });
      const error = await sendCode(user, "login", meta);
      return error ? json({ error }, error === "rate_limited" ? 429 : error === "mail_unavailable" ? 503 : 403) : json({ next: "otp" });
    }
    case "verify": {
      const user = await backofficeUser(body.email);
      if (!(await checkCode(user, "login", body.code, meta))) return json({ error: "invalid_code" }, 401);
      const browser = await createTrustedBrowser(sql, user!.id, meta.device);
      return json({ next: "signin" }, 200, { "Set-Cookie": trustCookie(browser.token) });
    }
    case "reset-start": {
      // Same response whether or not the account exists, so this cannot enumerate users.
      const user = await backofficeUser(body.email);
      if (user) await sendCode(user, "reset", meta);
      else await allowAttempt(sql, "otp-send-ip:" + meta.ip, 20);
      return json({ next: "reset-code" });
    }
    case "reset-verify": {
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 8 || password.length > 72) return json({ error: "weak_password" }, 400);
      const user = await backofficeUser(body.email);
      if (!(await checkCode(user, "reset", body.code, meta))) return json({ error: "invalid_code" }, 401);
      await sql`UPDATE users SET password_hash = ${await bcrypt.hash(password, 12)} WHERE id = ${user!.id}`;
      const revoked = await revokeUserSessions(sql, user!.id, "password_reset", { browsers: true });
      const revokedPasskeys = await revokeAllPasskeys(sql, user!.id, "password_reset");
      await audit(sql, { action: "password_reset", decision: "allow", actorUserId: user!.id, reason: `sessions_revoked:${revoked};passkeys_revoked:${revokedPasskeys}`, ipHash: meta.ipHash, device: meta.device });
      // The mailbox was just proven: this browser is trusted for the sign-in that follows.
      const browser = await createTrustedBrowser(sql, user!.id, meta.device);
      return json({ next: "signin" }, 200, { "Set-Cookie": trustCookie(browser.token) });
    }
    default:
      return json({ error: "unknown_action" }, 400);
  }
}
