import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertActor, assertOwner, isBackofficeClaims, type Actor, type ActorClaims } from "@/lib/access-policy";
const sessionClaims = async () => (await getServerSession(authOptions))?.user as ActorClaims | undefined;
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
