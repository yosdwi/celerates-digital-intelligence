// WebAuthn/passkey support for the Sales pilot.
// Biometric data and private keys never leave the user's authenticator. Registration is verified server-side
// from the WebAuthn attestation object; ERP persists only credential id, public key, counter and audit metadata.
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";
import type { KeyObject } from "node:crypto";
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

// Minimal defensive CBOR decoder for WebAuthn attestation objects / COSE public keys.
// It supports only definite-length primitives needed by WebAuthn and rejects oversized/truncated structures.
type CborValue = number | string | Buffer | boolean | null | CborValue[] | Map<CborValue, CborValue>;
function cborLength(buf: Buffer, offset: number, ai: number): { value: number; next: number } {
  if (ai < 24) return { value: ai, next: offset };
  if (ai === 24) {
    if (offset + 1 > buf.length) throw new Error("invalid_cbor");
    return { value: buf.readUInt8(offset), next: offset + 1 };
  }
  if (ai === 25) {
    if (offset + 2 > buf.length) throw new Error("invalid_cbor");
    return { value: buf.readUInt16BE(offset), next: offset + 2 };
  }
  if (ai === 26) {
    if (offset + 4 > buf.length) throw new Error("invalid_cbor");
    return { value: buf.readUInt32BE(offset), next: offset + 4 };
  }
  throw new Error("unsupported_cbor_length");
}
function decodeCbor(buf: Buffer, offset = 0, depth = 0): { value: CborValue; next: number } {
  if (depth > 12 || offset >= buf.length) throw new Error("invalid_cbor");
  const head = buf[offset++];
  const major = head >> 5;
  const ai = head & 31;

  if (major <= 1) {
    const n = cborLength(buf, offset, ai);
    return { value: major === 0 ? n.value : -1 - n.value, next: n.next };
  }
  if (major === 2 || major === 3) {
    const n = cborLength(buf, offset, ai);
    if (n.value > 8192 || n.next + n.value > buf.length) throw new Error("invalid_cbor");
    const raw = buf.subarray(n.next, n.next + n.value);
    return { value: major === 2 ? Buffer.from(raw) : raw.toString("utf8"), next: n.next + n.value };
  }
  if (major === 4) {
    const n = cborLength(buf, offset, ai);
    if (n.value > 64) throw new Error("invalid_cbor");
    const value: CborValue[] = [];
    let next = n.next;
    for (let i = 0; i < n.value; i++) {
      const item = decodeCbor(buf, next, depth + 1);
      value.push(item.value);
      next = item.next;
    }
    return { value, next };
  }
  if (major === 5) {
    const n = cborLength(buf, offset, ai);
    if (n.value > 64) throw new Error("invalid_cbor");
    const value = new Map<CborValue, CborValue>();
    let next = n.next;
    for (let i = 0; i < n.value; i++) {
      const k = decodeCbor(buf, next, depth + 1);
      const v = decodeCbor(buf, k.next, depth + 1);
      value.set(k.value, v.value);
      next = v.next;
    }
    return { value, next };
  }
  if (major === 6) {
    const n = cborLength(buf, offset, ai);
    return decodeCbor(buf, n.next, depth + 1);
  }
  if (major === 7) {
    if (ai === 20) return { value: false, next: offset };
    if (ai === 21) return { value: true, next: offset };
    if (ai === 22) return { value: null, next: offset };
  }
  throw new Error("unsupported_cbor");
}

function mapValue(map: Map<CborValue, CborValue>, key: string | number) {
  for (const [k, v] of map.entries()) if (k === key) return v;
  return undefined;
}

function cosePublicKey(cose: Map<CborValue, CborValue>): { algorithm: -7 | -257; spki: string; key: KeyObject } {
  const kty = mapValue(cose, 1);
  const alg = mapValue(cose, 3);
  let jwk: Record<string, string>;

  if (kty === 2 && alg === -7 && mapValue(cose, -1) === 1) {
    const x = mapValue(cose, -2);
    const y = mapValue(cose, -3);
    if (!Buffer.isBuffer(x) || x.length !== 32 || !Buffer.isBuffer(y) || y.length !== 32) throw new Error("invalid_cose_key");
    jwk = { kty: "EC", crv: "P-256", x: x.toString("base64url"), y: y.toString("base64url") };
  } else if (kty === 3 && alg === -257) {
    const n = mapValue(cose, -1);
    const e = mapValue(cose, -2);
    if (!Buffer.isBuffer(n) || n.length < 128 || !Buffer.isBuffer(e) || e.length < 1) throw new Error("invalid_cose_key");
    jwk = { kty: "RSA", n: n.toString("base64url"), e: e.toString("base64url") };
  } else {
    throw new Error("unsupported_algorithm");
  }

  const key = createPublicKey({ key: jwk as any, format: "jwk" });
  const spki = (key.export({ type: "spki", format: "der" }) as Buffer).toString("base64url");
  return { algorithm: alg as -7 | -257, spki, key };
}

function verifiedRegistration(attestationEncoded: string, expectedCredentialId: string) {
  const attestation = decodeBase64Url(attestationEncoded, 16384);
  const top = decodeCbor(attestation);
  if (!(top.value instanceof Map) || top.next !== attestation.length) throw new Error("invalid_attestation");
  const fmt = mapValue(top.value, "fmt");
  const authDataValue = mapValue(top.value, "authData");
  if (fmt !== "none" || !Buffer.isBuffer(authDataValue)) throw new Error("unsupported_attestation");
  const authData = authDataValue;
  if (authData.length < 55) throw new Error("invalid_authenticator_data");

  const { rpId } = passkeyRp();
  if (!timingSafeEqual(authData.subarray(0, 32), sha256(rpId))) throw new Error("rp_id_mismatch");
  const flags = authData[32];
  if ((flags & 0x01) === 0 || (flags & 0x04) === 0 || (flags & 0x40) === 0) throw new Error("user_verification_required");
  const signCount = authData.readUInt32BE(33);

  let offset = 37 + 16; // rpIdHash + flags + counter + AAGUID
  if (offset + 2 > authData.length) throw new Error("invalid_authenticator_data");
  const credentialLength = authData.readUInt16BE(offset);
  offset += 2;
  if (credentialLength < 16 || credentialLength > 1024 || offset + credentialLength > authData.length) throw new Error("invalid_credential_id");
  const credentialId = authData.subarray(offset, offset + credentialLength).toString("base64url");
  offset += credentialLength;
  if (credentialId !== expectedCredentialId) throw new Error("credential_id_mismatch");

  const decodedKey = decodeCbor(authData, offset);
  if (!(decodedKey.value instanceof Map)) throw new Error("invalid_cose_key");
  const key = cosePublicKey(decodedKey.value);
  return { ...key, signCount };
}

function validateStoredPublicKey(spkiEncoded: string, algorithm: number) {
  if (algorithm !== -7 && algorithm !== -257) throw new Error("unsupported_algorithm");
  const der = decodeBase64Url(spkiEncoded, 2048);
  const key = createPublicKey({ key: der, format: "der", type: "spki" });
  if (algorithm === -7 && key.asymmetricKeyType !== "ec") throw new Error("algorithm_key_mismatch");
  if (algorithm === -257 && key.asymmetricKeyType !== "rsa") throw new Error("algorithm_key_mismatch");
  return key;
}

export async function registerPasskey(
  sql: Sql,
  input: {
    userId: string;
    challengeId: string;
    credentialId: string;
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
    label?: string | null;
  },
): Promise<{ id: string }> {
  const cd = clientData(input.clientDataJSON, "webauthn.create");
  const credentialId = normalizedCredentialId(input.credentialId);
  const verified = verifiedRegistration(input.attestationObject, credentialId);
  const transports = (input.transports ?? []).filter((v) => ["usb", "nfc", "ble", "internal", "hybrid"].includes(v)).slice(0, 5);
  const label = input.label?.trim().slice(0, 80) || null;

  return sql.begin(async (tx) => {
    if (!(await consumeChallenge(tx, { id: input.challengeId, purpose: "register", challenge: cd.challenge, userId: input.userId }))) {
      throw new Error("invalid_or_expired_challenge");
    }
    const [row] = await tx`INSERT INTO auth_passkey_credentials
      (user_id, credential_id, public_key_spki, algorithm, sign_count, transports, label)
      VALUES (${input.userId}, ${credentialId}, ${verified.spki}, ${verified.algorithm}, ${verified.signCount}, ${transports}, ${label})
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

    let key: KeyObject;
    try {
      key = validateStoredPublicKey(row.public_key_spki as string, Number(row.algorithm));
    } catch {
      return null;
    }
    const signed = Buffer.concat([authData, sha256(cd.raw)]);
    if (!verifySignature("sha256", signed, key, signature)) return null;

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
