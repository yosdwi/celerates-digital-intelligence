"use server";
// User-facing security actions (docs/security/02, 03). Every decision is re-made on the server from the live session.
import { revalidatePath } from "next/cache";
import { sql } from "@/db";
import { currentClaims, requestMeta, requireActor } from "@/lib/actor";
import { revealIdentityField, RevealDenied, type IdentityField } from "@/lib/people/identity";
import { audit } from "./audit";
import { revokeSession, revokeTrustedBrowser, revokeUserSessions } from "./session";
import { revokePasskey } from "./passkey";

export type RevealResult = { ok: true; value: string | null } | { ok: false; error: string };

/** Plaintext of one identity number, for a user with the capability and a fresh step-up. Audited. */
export async function revealField(onboardingId: string, field: IdentityField): Promise<RevealResult> {
  await requireActor();
  const claims = await currentClaims();
  if (!claims) return { ok: false, error: "unauthorized" };
  try {
    return { ok: true, value: await revealIdentityField(sql, claims, onboardingId, field, await requestMeta()) };
  } catch (error) {
    if (error instanceof RevealDenied) return { ok: false, error: error.code };
    throw error;
  }
}

/** Sign one of my own devices out. */
export async function revokeMySession(sid: string): Promise<void> {
  await requireActor();
  const claims = await currentClaims();
  if (!claims) return;
  if (await revokeSession(sql, sid, "user_revoked", claims.userId))
    await audit(sql, { action: "session_revoke", decision: "allow", actorUserId: claims.userId, sessionId: claims.sid, resourceType: "auth_session", resourceId: sid, ...(await requestMeta()) });
  revalidatePath("/profile");
}

/** Forget a trusted browser: the next sign-in there needs an email code again. */
export async function revokeMyTrustedBrowser(id: string): Promise<void> {
  await requireActor();
  const claims = await currentClaims();
  if (!claims) return;
  if (await revokeTrustedBrowser(sql, claims.userId, id, "user_revoked"))
    await audit(sql, { action: "trusted_browser_revoke", decision: "allow", actorUserId: claims.userId, sessionId: claims.sid, resourceType: "auth_trusted_browser", resourceId: id, ...(await requestMeta()) });
  revalidatePath("/profile");
}



/** Revoke one of my own passkeys. The device credential remains local, but the server will no longer accept it. */
export async function revokeMyPasskey(id: string): Promise<void> {
  await requireActor();
  const claims = await currentClaims();
  if (!claims) return;
  if (await revokePasskey(sql, claims.userId, id, "user_revoked"))
    await audit(sql, { action: "passkey_revoke", decision: "allow", actorUserId: claims.userId, sessionId: claims.sid, resourceType: "auth_passkey", resourceId: id, ...(await requestMeta()) });
  revalidatePath("/profile");
}

/** Sign out everywhere, this browser included, and forget every trusted browser. */
export async function logoutAllDevices(): Promise<void> {
  await requireActor();
  const claims = await currentClaims();
  if (!claims) return;
  const count = await revokeUserSessions(sql, claims.userId, "logout_all", { browsers: true });
  await audit(sql, { action: "logout_all", decision: "allow", actorUserId: claims.userId, sessionId: claims.sid, reason: `sessions_revoked:${count}`, ...(await requestMeta()) });
}
