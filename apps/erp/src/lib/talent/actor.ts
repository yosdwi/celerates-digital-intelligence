// Server guard for Talent entry points (ADR-019 §4). A Talent may act only as the ConForm employee their active
// identity link names; the employee id never comes from the client.
import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { activeLinkForUser, type TalentLink } from "./identity";

export class TalentAccessError extends Error {}

export type TalentActor = { userId: string; name: string; email: string; link: TalentLink };

/** The signed-in Talent session (active, account_type talent), whether or not it is linked yet. */
export const requireTalentSession = cache(async () => {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; status?: string; accountType?: string; isOwner?: boolean; fullName?: string; email?: string } | undefined;
  if (!user?.id || user.status !== "active" || user.accountType !== "talent" || user.isOwner) throw new TalentAccessError("Akses Talent tidak tersedia.");
  return { userId: user.id, name: user.fullName ?? "", email: user.email ?? "" };
});

export const requireTalentActor = cache(async (): Promise<TalentActor> => {
  const session = await requireTalentSession();
  const link = await activeLinkForUser(sql, session.userId);
  if (!link) throw new TalentAccessError("Akun Talent belum terhubung ke data operasional.");
  return { ...session, link };
});

export const talentActorTag = (actor: TalentActor) => `celerates-talent:${actor.userId}`;
