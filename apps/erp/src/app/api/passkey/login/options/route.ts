import { sql } from "@/db";
import { allowAttempt } from "@/lib/login-throttle";
import { audit } from "@/lib/security/audit";
import { clientMeta } from "@/lib/security/session";
import { issuePasskeyChallenge, passkeyRp } from "@/lib/security/passkey";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(process.env.NEXTAUTH_URL || request.url).host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const meta = clientMeta(request.headers);
  if (!(await allowAttempt(sql, "passkey-options-ip:" + (meta.ip || "unknown"), 30))) {
    await audit(sql, { action: "passkey_login_options", decision: "deny", reason: "rate_limited", ipHash: meta.ipHash, device: meta.device });
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const issued = await issuePasskeyChallenge(sql, { purpose: "login" });
  const rp = passkeyRp();
  return Response.json({
    challengeId: issued.id,
    publicKey: {
      challenge: issued.challenge,
      rpId: rp.rpId,
      timeout: 60_000,
      userVerification: "required",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
