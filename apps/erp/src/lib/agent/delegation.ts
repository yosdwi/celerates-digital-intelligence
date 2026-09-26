// ADR-008: ERP issues short-lived Ed25519 user delegations for the Agent and re-verifies them on every
// delegated contract call. Intelligence holds public keys only. The browser never receives a token.
import { createPrivateKey, createPublicKey, randomUUID, sign, verify, type KeyObject } from "node:crypto";

export const AUDIENCE = "celerates-intelligence";
const TTL_SECONDS = 300;
const MAX_LIFETIME = 600;
const SKEW = 30;

export type DelegationContext = {
  path: string;
  module: string;
  entity?: { type: string; id: string } | null;
};
export type DelegationClaims = {
  iss: string;
  aud: string;
  sub: string;
  name: string;
  owner: boolean;
  access: { division: string; level: string }[];
  scope: string[];
  ctx: DelegationContext;
  iat: number;
  exp: number;
  jti: string;
};
export class DelegationError extends Error {}

export const environment = () => process.env.INTELLIGENCE_ENVIRONMENT || process.env.APP_ENV || "erp-pilot";
export const issuer = () => `celerates-erp:${environment()}`;
const pem = (value: string) => value.replace(/\\n/g, "\n");
const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");

function privateKey(): { kid: string; key: KeyObject } | null {
  const raw = process.env.AGENT_DELEGATION_PRIVATE_KEY;
  const kid = process.env.AGENT_DELEGATION_KID;
  if (!raw || !kid) return null;
  const key = createPrivateKey(pem(raw));
  if (key.asymmetricKeyType !== "ed25519") throw new DelegationError("Delegation key must be Ed25519");
  return { kid, key };
}

export function delegationConfigured(): boolean {
  try {
    return privateKey() !== null;
  } catch {
    return false;
  }
}

function publicKeys(): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>();
  const current = privateKey();
  if (current) keys.set(current.kid, createPublicKey(current.key));
  const previous = JSON.parse(process.env.AGENT_DELEGATION_PREVIOUS_PUBLIC_KEYS || "{}") as Record<string, string>;
  for (const [kid, value] of Object.entries(previous)) {
    const key = createPublicKey(pem(value));
    if (key.asymmetricKeyType === "ed25519" && !keys.has(kid)) keys.set(kid, key);
  }
  return keys;
}

export function mintDelegation(
  user: { id: string; name: string; owner: boolean; access: { division: string; level: string }[] },
  ctx: DelegationContext,
  now = Math.floor(Date.now() / 1000),
): string {
  const signer = privateKey();
  if (!signer) throw new DelegationError("Agent delegation is not configured");
  const claims: DelegationClaims = {
    iss: issuer(),
    aud: AUDIENCE,
    sub: user.id,
    name: user.name.slice(0, 120),
    owner: user.owner,
    access: user.access,
    scope: ["agent"],
    ctx,
    iat: now,
    exp: now + TTL_SECONDS,
    jti: randomUUID(),
  };
  const head = b64(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: signer.kid }));
  const body = b64(JSON.stringify(claims));
  return `${head}.${body}.${b64(sign(null, Buffer.from(`${head}.${body}`), signer.key))}`;
}

/** ERP sign-in to the Brain Console (ADR-016): Owner only, separate audience and scope, 2 hours. */
export const CONSOLE_AUDIENCE = "celerates-intelligence-console";
const CONSOLE_TTL_SECONDS = 2 * 3600;
export function mintConsoleSignIn(user: { id: string; name: string; owner: boolean }, now = Math.floor(Date.now() / 1000)): string {
  const signer = privateKey();
  if (!signer) throw new DelegationError("Agent delegation is not configured");
  if (!user.owner) throw new DelegationError("Brain Console sign-in is for ERP Owners");
  const claims = { iss: issuer(), aud: CONSOLE_AUDIENCE, sub: user.id, name: user.name.slice(0, 120), owner: true, scope: ["console"], iat: now, exp: now + CONSOLE_TTL_SECONDS, jti: randomUUID() };
  const head = b64(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: signer.kid }));
  const body = b64(JSON.stringify(claims));
  return `${head}.${body}.${b64(sign(null, Buffer.from(`${head}.${body}`), signer.key))}`;
}

export function verifyDelegation(token: string | null, now = Math.floor(Date.now() / 1000)): DelegationClaims {
  if (!token || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw new DelegationError("Malformed delegation");
  const [head, body, signature] = token.split(".");
  let header: { alg?: string; typ?: string; kid?: string };
  let claims: DelegationClaims;
  try {
    header = JSON.parse(Buffer.from(head, "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new DelegationError("Malformed delegation");
  }
  if (header.alg !== "EdDSA" || header.typ !== "JWT") throw new DelegationError("Unsupported delegation");
  const key = publicKeys().get(String(header.kid));
  if (!key || !verify(null, Buffer.from(`${head}.${body}`), key, Buffer.from(signature, "base64url")))
    throw new DelegationError("Invalid delegation signature");
  if (claims.iss !== issuer() || claims.aud !== AUDIENCE) throw new DelegationError("Delegation issuer/audience");
  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.exp <= claims.iat || claims.exp - claims.iat > MAX_LIFETIME)
    throw new DelegationError("Invalid delegation lifetime");
  if (claims.iat > now + SKEW || claims.exp < now - SKEW) throw new DelegationError("Delegation expired");
  if (!Array.isArray(claims.scope) || !claims.scope.includes("agent")) throw new DelegationError("Delegation scope");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(claims.sub)))
    throw new DelegationError("Delegation subject");
  return claims;
}
