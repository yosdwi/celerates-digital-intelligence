// Server-side read guard for record pages (doc 18 §16). Navigation visibility is not authorization: a page
// that shows division records checks the caller's division level itself and fails closed (404).
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requirePilotActor } from "@/lib/actor";
import { claimsOf, divisionLevel, type AccessClaims } from "@/lib/module-access";

export type DivisionLevels = Record<string, "full" | "editor" | "viewer" | null>;

/** Requires read access to at least one of `divisions`; returns the caller's level per division. */
export async function requireDivisionRead(...divisions: string[]): Promise<{ claims: AccessClaims; levels: DivisionLevels }> {
  await requirePilotActor();
  const session = await getServerSession(authOptions);
  const claims = claimsOf(session?.user);
  const levels = Object.fromEntries(divisions.map((d) => [d, divisionLevel(claims, d)])) as DivisionLevels;
  if (!Object.values(levels).some(Boolean)) notFound();
  return { claims, levels };
}

export const canWrite = (level: DivisionLevels[string]) => level === "editor" || level === "full";
