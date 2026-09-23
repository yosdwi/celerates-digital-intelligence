import { db } from "@/db";
import { userAccess, divisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notifyDivision } from "@/lib/notifications";

/** Divisi yang dimiliki user (tm/hr saja yang relevan untuk modul ini). */
export async function resolveActorDivision(actingUserId: string): Promise<"tm" | "hr" | null> {
  const rows = await db.select({ key: divisions.key }).from(userAccess)
    .innerJoin(divisions, eq(userAccess.division_id, divisions.id))
    .where(eq(userAccess.user_id, actingUserId));
  const keys = new Set(rows.map((r) => r.key));
  if (keys.has("tm")) return "tm";
  if (keys.has("hr")) return "hr";
  return null;
}

/** Divisi lawan (tm<->hr) yang perlu dinotif -- fallback ke keduanya kalau actor tidak punya divisi tm/hr sama sekali. */
export async function resolveNotifyTargets(actingUserId: string): Promise<("tm" | "hr")[]> {
  const myDivision = await resolveActorDivision(actingUserId);
  if (!myDivision) return ["tm", "hr"];
  return myDivision === "tm" ? ["hr"] : ["tm"];
}

export async function notifyOtherDivision(actingUserId: string, title: string, body: string, link: string) {
  const targets = await resolveNotifyTargets(actingUserId);
  for (const key of targets) await notifyDivision(key, title, body, link);
}
