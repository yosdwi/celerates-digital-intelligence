"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { notifications, userAccess, divisions } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Helper generik -- dipanggil dari action manapun (bukan form action sendiri). */
export async function createNotification(userId: string, title: string, body?: string | null, link?: string | null) {
  await requirePilotActor();

  await db.insert(notifications).values({ user_id: userId, title, body: body ?? null, link: link ?? null });
}

/** Broadcast ke semua user yang punya akses ke sebuah divisi (mis. "tm", "pmo"). */
export async function notifyDivision(divisionKey: string, title: string, body?: string | null, link?: string | null) {
  await requirePilotActor();

  const members = await db
    .select({ userId: userAccess.user_id })
    .from(userAccess)
    .innerJoin(divisions, eq(userAccess.division_id, divisions.id))
    .where(eq(divisions.key, divisionKey));

  for (const m of members) {
    await createNotification(m.userId, title, body, link);
  }
}
