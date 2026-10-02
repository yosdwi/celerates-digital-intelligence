// "Confirm it's you" (docs/security/02 §step-up): an email code bound to the current session. On success the session's
// step_up_at is set, which keeps sensitive actions open for a 10-minute task window. Talent confirm by opening their
// latest WhatsApp link instead (middleware keeps Talent sessions off this route).
import { sql } from "@/db";
import { currentClaims } from "@/lib/actor";
import { allowAttempt } from "@/lib/login-throttle";
import { audit } from "@/lib/security/audit";
import { issueChallenge, mail, mailboxAllowed, verifyChallenge } from "@/lib/security/email-otp";
import { clientMeta, markStepUp } from "@/lib/security/session";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "forbidden" }, 403);
  const claims = await currentClaims();
  if (!claims || claims.accountType === "talent") return json({ error: "unauthorized" }, 403);
  const meta = clientMeta(request.headers);
  const body = (await request.json().catch(() => ({}))) as { action?: string; code?: string };
  const base = { actorUserId: claims.userId, sessionId: claims.sid, ipHash: meta.ipHash, device: meta.device };

  if (body.action === "send") {
    if (!mailboxAllowed(claims.email).ok) return json({ error: "mailbox_not_allowed" }, 403);
    if (!(await allowAttempt(sql, "otp-send:" + claims.userId, 5))) return json({ error: "rate_limited" }, 429);
    const { code } = await issueChallenge(sql, { userId: claims.userId, purpose: "step_up", sessionId: claims.sid });
    try {
      await mail.send(claims.email, code, "step_up");
    } catch (error) {
      console.error("[auth] step-up delivery failed", (error as { code?: string }).code ?? "error");
      await audit(sql, { ...base, action: "otp_step_up_send", decision: "deny", reason: "delivery_failed" });
      return json({ error: "mail_unavailable" }, 503);
    }
    await audit(sql, { ...base, action: "otp_step_up_send", decision: "allow" });
    return json({ next: "code", email: claims.email.replace(/^(.).*(@.*)$/, "$1•••$2") });
  }
  if (body.action === "verify") {
    if (!(await allowAttempt(sql, "otp-verify:" + claims.userId, 15))) return json({ error: "rate_limited" }, 429);
    const result = await verifyChallenge(sql, { userId: claims.userId, purpose: "step_up", sessionId: claims.sid, code: body.code ?? "" });
    if (result.ok) await markStepUp(sql, claims.sid);
    await audit(sql, { ...base, action: "step_up", decision: result.ok ? "allow" : "deny", reason: result.ok ? result.delivery : "invalid_or_expired" });
    return result.ok ? json({ ok: true }) : json({ error: "invalid_code" }, 401);
  }
  return json({ error: "unknown_action" }, 400);
}
