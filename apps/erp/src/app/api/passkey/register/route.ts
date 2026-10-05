import bcrypt from "bcryptjs";
import { sql } from "@/db";
import { currentClaims, requestMeta } from "@/lib/actor";
import { audit } from "@/lib/security/audit";
import { allowAttempt } from "@/lib/login-throttle";
import { issuePasskeyChallenge, listPasskeys, passkeyRp, registerPasskey } from "@/lib/security/passkey";

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

export async function GET() {
  const claims = await currentClaims();
  if (!claims || claims.accountType === "talent") return Response.json({ error: "unauthorized" }, { status: 401 });
  const [user] = await sql`SELECT id, email, full_name FROM users WHERE id = ${claims.userId} AND status = 'active'`;
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const issued = await issuePasskeyChallenge(sql, { purpose: "register", userId: claims.userId });
  const rp = passkeyRp();
  const existing = await listPasskeys(sql, claims.userId);
  const credentialRows = await sql`SELECT credential_id, transports FROM auth_passkey_credentials
    WHERE user_id = ${claims.userId} AND revoked_at IS NULL`;

  return Response.json({
    challengeId: issued.id,
    publicKey: {
      challenge: issued.challenge,
      rp: { id: rp.rpId, name: rp.rpName },
      user: {
        id: Buffer.from(claims.userId, "utf8").toString("base64url"),
        name: user.email,
        displayName: user.full_name,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      timeout: 60_000,
      attestation: "none",
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
      excludeCredentials: credentialRows.map((c) => ({
        type: "public-key",
        id: c.credential_id,
        transports: c.transports ?? [],
      })),
    },
    existingCount: existing.length,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const claims = await currentClaims();
  if (!claims || claims.accountType === "talent") return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!(await allowAttempt(sql, "passkey-register:" + claims.userId, 10))) {
    await audit(sql, { action: "passkey_register", decision: "deny", actorUserId: claims.userId, sessionId: claims.sid, reason: "rate_limited", ...(await requestMeta()) });
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const [user] = await sql`SELECT id, password_hash FROM users WHERE id = ${claims.userId} AND status = 'active'`;
  if (!user?.password_hash || !currentPassword || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    await audit(sql, { action: "passkey_register", decision: "deny", actorUserId: claims.userId, sessionId: claims.sid, reason: "password_confirmation_failed", ...(await requestMeta()) });
    return Response.json({ error: "invalid_password" }, { status: 401 });
  }

  try {
    const result = await registerPasskey(sql, {
      userId: claims.userId,
      challengeId: String(body.challengeId ?? ""),
      credentialId: String(body.credentialId ?? ""),
      clientDataJSON: String(body.clientDataJSON ?? ""),
      attestationObject: String(body.attestationObject ?? ""),
      transports: Array.isArray(body.transports) ? body.transports.filter((x): x is string => typeof x === "string") : [],
      label: typeof body.label === "string" ? body.label : null,
    });
    await audit(sql, { action: "passkey_register", decision: "allow", actorUserId: claims.userId, sessionId: claims.sid, resourceType: "auth_passkey", resourceId: result.id, ...(await requestMeta()) });
    return Response.json({ ok: true });
  } catch (error) {
    await audit(sql, { action: "passkey_register", decision: "deny", actorUserId: claims.userId, sessionId: claims.sid, reason: (error as Error).message.slice(0, 120), ...(await requestMeta()) });
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
