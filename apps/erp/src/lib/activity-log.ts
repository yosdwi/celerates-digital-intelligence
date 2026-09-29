"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type ActionType = "create" | "update" | "delete";

/**
 * Helper generik -- dipanggil dari action manapun setelah operasi DB berhasil.
 * Ambil user dari session sendiri, jadi caller cukup kirim divisi + deskripsinya.
 */
export async function logActivity(divisionKey: string, actionType: ActionType, entityLabel: string, pageLabel?: string) {
  await requirePilotActor();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id ?? null;
  const userName = (session?.user as any)?.fullName ?? session?.user?.name ?? session?.user?.email ?? "Unknown";

  await db.insert(activityLogs).values({
    division_key: divisionKey,
    action_type: actionType,
    entity_label: entityLabel,
    page_label: pageLabel ?? null,
    actor_user_id: userId,
    actor_name: userName,
  });
}
