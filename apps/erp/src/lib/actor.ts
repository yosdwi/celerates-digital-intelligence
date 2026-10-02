import { cache } from "react";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { sql } from "@/db";
import { authOptions } from "@/lib/auth";
import { assertActor, assertOwner, isBackofficeClaims, type Actor, type ActorClaims } from "@/lib/access-policy";
import { stepUpFresh, type Capability } from "@/lib/security/policy";
import { clientMeta, loadSession, type SessionClaims } from "@/lib/security/session";
const sessionClaims = async () => (await getServerSession(authOptions))?.user as ActorClaims | undefined;

/** The live session with fresh claims from PostgreSQL (docs/security/02), or null. One lookup per request. */
export const currentClaims = cache(async (): Promise<SessionClaims | null> => {
  const sid = ((await getServerSession(authOptions))?.user as { sid?: string } | undefined)?.sid;
  return sid ? loadSession(sql, sid) : null;
});
/** Coarse request metadata for the audit log (hashed IP, device family). */
export const requestMeta = async () => {
  const { ipHash, device } = clientMeta(await headers());
  return { ipHash, device };
};
export class StepUpRequiredError extends Error {
  code = "step_up_required";
  constructor() {
    super("Konfirmasi identitas diperlukan (step_up_required).");
  }
}
/**
 * Step-up gate for sensitive actions: the caller holds the capability (Owner always holds access.admin) and
 * confirmed an email code in this session within the last 10 minutes. Record-level scope is `can()`'s job.
 */
export async function requireRecentAuth(capability: Capability): Promise<SessionClaims> {
  const claims = await currentClaims();
  if (!claims) throw new Error("Sesi tidak valid, silakan login ulang");
  const holds = claims.capabilities.some((c) => c.capability === capability) || (capability === "access.admin" && claims.isOwner);
  if (!holds) throw new Error("Anda tidak memiliki izin untuk data ini.");
  if (!stepUpFresh(claims.stepUpAt)) throw new StepUpRequiredError();
  return claims;
}
/** Active backoffice user (any division, Owner included). Module authority is checked after it. */
export const requireActor = cache(async () => assertActor(await sessionClaims()));
/** Active Owner. For Owner-only modules (executive dashboard, kill switch). */
export const requireOwner = cache(async () => assertOwner(await sessionClaims()));
/** A signed-in backoffice account still waiting for approval: it may only request access for itself. */
export const requirePendingActor = cache(async () => {
  const user = await sessionClaims();
  if (!user?.id || user.status !== "pending" || !isBackofficeClaims(user)) throw new Error("Akses tidak tersedia.");
  return user as Actor;
});
