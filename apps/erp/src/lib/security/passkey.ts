// WebAuthn/passkey support for the Sales pilot.
// The device/authenticator keeps biometric data and the private key. Celerates stores only the public key,
// credential id and monotonic counter. Registration is tied to an already-authenticated backoffice session;
// login requires authenticator user verification (Face ID / Touch ID / Windows Hello / device PIN as supported).
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";

type Tx = Sql | TransactionSql;
export type PasskeyPurpose = "register" | "login";
export const PASSKEY_CHALLENGE_TTL_SECONDS = 5 * 60;

const B64URL = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest();
const sha256Hex = (value: Buffer | string) => sha256(value).toString("hex");
export const encodeBase64Url = (value: Buffer | Uint8Array | ArrayBuffer) =>
  Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value).toString("base64url");

export function decodeBase64Url(value: string, maxBytes = 8192): Buffer {
  if (!value || value.length > maxBytes * 2 || !B64URL.test(value)) throw new Error("invalid_base64url");
  const out = Buffer.from(value, "base64url");
  if (!out.length || out.length > maxBytes) throw new Error("invalid_base64url");
  return out;
}

export function passkeyRp() {
  const base = new URL(process.env.NEXTAUTH_URL || "http://localhost:3000");
  const rpId = (process.env.PASSKEY_RP_ID || base.hostname).trim().toLowerCase();
  const origin = (process.env.PASSKEY_ORIGIN || base.origin).trim();
  if (!rpId || rpId.includes("/") || rpId.includes(":")) throw new Error("invalid_passkey_rp_id");
  if (!origin.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    throw new Error("passkey_origin_requires_https");
  }
  return { rpId, origin, rpName: process.env.PASSKEY_RP_NAME || "Celerates ERP" };
}

export async function issuePasskeyChallenge(
  sql: Tx,
  input: { purpose: PasskeyPurpose; userId?: string | null },
): Promise<{ id: string; challenge: string }> {
  if (input.purpose === "register" && (!input.userId || !UUID.test(input.userId))) throw new Error("register_user_required");
  if (input.purpose === "login" && input.userId) throw new Error("login_challenge_is_anonymous");
  const challenge = randomBytes(32).toString("base64url");
  const [row] = await sql`INSERT INTO auth_passkey_challenges (user_id, purpose, challenge_sha256, expires_at)
    VALUES (${input.userId ?? null}, ${input.purpose}, ${sha256Hex(challenge)},
            now() + make_interval(secs => ${PASSKEY_CHALLENGE_TTL_SECONDS}))
    RETURNING id`;
  return { id: row.id as string, challenge };
}

async function consumeChallenge(
  sql: Tx,
  input: { id: string; purpose: PasskeyPurpose; challenge: string; userId?: string | null },
) {
  if (!UUID.test(input.id)) return false;
  const rows = await sql`UPDATE auth_passkey_challenges SET consumed_at = now()
    WHERE id = ${input.id} AND purpose = ${input.purpose} AND consumed_at IS NULL AND expires_at > now()
      AND challenge_sha256 = ${sha256Hex(input.challenge)}
      AND user_id IS NOT DISTINCT FROM ${input.userId ?? null}::uuid
    RETURNING id`;
  return rows.length === 1;
}

type ClientData = { type?: unknown; challenge?: unknown; origin?: unknown; crossOrigin?: unknown };
function clientData(
  encoded: string,
  expectedType: "webauthn.create" | "webauthn.get",
): { raw: Buffer; challenge: string } {
  const raw = decodeBase64Url(encoded, 4096);
  let parsed: ClientData;
  try {
    parsed = JSON.parse(raw.toString("utf8")) as ClientData;
  } catch {
    throw new Error("invalid_client_data");
  }
  const { origin } = passkeyRp();
  if (parsed.type !== expectedType || parsed.origin !== origin || parsed.crossOrigin === true || typeof parsed.challenge !== "string") {
    throw new Error("invalid_client_data");
  }
  return { raw, challenge: parsed.challenge };
}

function normalizedCredentialId(value: string) {
  const raw = decodeBase64Url(value, 1024);
  if (raw.length < 16) throw new Error("invalid_credential_id");
  return raw.toString("base64url");
}

function validatePublicKey(spkiEncoded: string, algorithm: number) {
  if (algorithm !== -7 && algorithm !== -257) throw new Error("unsupported_algorithm");
  const der = decodeBase64Url(spkiEncoded, 2048);
  const key = createPublicKey({ key: der, format: "der", type: "spki" });
  if (algorithm === -7 && key.asymmetricKeyType !== "ec") throw new Error("algorithm_key_mismatch");
  if (algorithm === -257 && key.asymmetricKeyType !== "rsa") throw new Error("algorithm_key_mismatch");
  return { der, key };
}

export async function registerPasskey(
  sql: Sql,
  input: {
    userId: string;
    challengeId: string;
    credentialId: string;
    clientDataJSON: string;
    publicKeySpki: string;
    algorithm: number;
    transports?: string[];
    label?: string | null;
  },
): Promise<{ id: string }> {
  const cd = clientData(input.clientDataJSON, "webauthn.create");
  const credentialId = normalizedCredentialId(input.credentialId);
  validatePublicKey(input.publicKeySpki, input.algorithm);
  const transports = (input.transports ?? []).filter((v) => ["usb", "nfc", "ble", "internal", "hybrid"].includes(v)).slice(0, 5);
  const label = input.label?.trim().slice(0, 80) || null;

  return sql.begin(async (tx) => {
    if (!(await consumeChallenge(tx, { id: input.challengeId, purpose: "register", challenge: cd.challenge, userId: input.userId }))) {
      throw new Error("invalid_or_expired_challenge");
    }
    const [row] = await tx`INSERT INTO auth_passkey_credentials
      (user_id, credential_id, public_key_spki, algorithm, transports, label)
      VALUES (${input.userId}, ${credentialId}, ${input.publicKeySpki}, ${input.algorithm}, ${transports}, ${label})
      ON CONFLICT (credential_id) DO NOTHING RETURNING id`;
    if (!row) throw new Error("credential_already_registered");
    return { id: row.id as string };
  });
}

export async function verifyPasskeyAssertion(
  sql: Sql,
  input: {
    challengeId: string;
    credentialId: string;
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string | null;
  },
): Promise<{ id: string; email: string; full_name: string; account_type: string } | null> {
  const cd = clientData(input.clientDataJSON, "webauthn.get");
  const credentialId = normalizedCredentialId(input.credentialId);
  const authData = decodeBase64Url(input.authenticatorData, 2048);
  const signature = decodeBase64Url(input.signature, 2048);
  if (authData.length < 37) return null;

  const { rpId } = passkeyRp();
  if (!timingSafeEqual(authData.subarray(0, 32), sha256(rpId))) return null;

  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  if (!userPresent || !userVerified) return null;
  const counter = authData.readUInt32BE(33);

  return sql.begin(async (tx) => {
    if (!(await consumeChallenge(tx, { id: input.challengeId, purpose: "login", challenge: cd.challenge }))) return null;

    const [row] = await tx`SELECT c.id AS credential_pk, c.user_id, c.public_key_spki, c.algorithm, c.sign_count,
          u.id, u.email, u.full_name, u.account_type, u.status
      FROM auth_passkey_credentials c JOIN users u ON u.id = c.user_id
      WHERE c.credential_id = ${credentialId} AND c.revoked_at IS NULL`;
    if (!row || row.status !== "active" || row.account_type === "talent") return null;

    if (input.userHandle) {
      const handle = decodeBase64Url(input.userHandle, 128).toString("utf8");
      if (handle !== row.user_id) return null;
    }

    let key;
    try {
      key = validatePublicKey(row.public_key_spki as string, Number(row.algorithm)).key;
    } catch {
      return null;
    }
    const signed = Buffer.concat([authData, sha256(cd.raw)]);
    const valid = verifySignature("sha256", signed, key, signature);
    if (!valid) return null;

    const previous = Number(row.sign_count ?? 0);
    // Multi-device passkeys may legitimately keep the counter at zero. When either side has a real counter,
    // a non-increasing value is treated as a cloned/replayed authenticator signal.
    if ((previous !== 0 || counter !== 0) && counter <= previous) return null;

    await tx`UPDATE auth_passkey_credentials SET sign_count = ${Math.max(previous, counter)}, last_used_at = now()
      WHERE id = ${row.credential_pk}`;
    return { id: row.user_id as string, email: row.email as string, full_name: row.full_name as string, account_type: row.account_type as string };
  });
}

export async function listPasskeys(sql: Tx, userId: string) {
  return sql<{ id: string; label: string | null; transports: string[]; created_at: Date; last_used_at: Date | null }[]>`
    SELECT id, label, transports, created_at, last_used_at FROM auth_passkey_credentials
    WHERE user_id = ${userId} AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 20`;
}

export async function revokePasskey(sql: Tx, userId: string, id: string, reason: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await sql`UPDATE auth_passkey_credentials SET revoked_at = now(), revoke_reason = ${reason}
    WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL RETURNING id`;
  return rows.length === 1;
}

export async function revokeAllPasskeys(sql: Tx, userId: string, reason: string): Promise<number> {
  const rows = await sql`UPDATE auth_passkey_credentials SET revoked_at = now(), revoke_reason = ${reason}
    WHERE user_id = ${userId} AND revoked_at IS NULL RETURNING id`;
  return rows.length;
}
