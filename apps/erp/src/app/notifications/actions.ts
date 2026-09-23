"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getMyNotifications() {
  await requirePilotActor();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return [];
  return db.select().from(notifications).where(eq(notifications.user_id, userId)).orderBy(desc(notifications.created_at)).limit(30);
}

export async function markNotificationRead(id: string) {
  await requirePilotActor();

  await db.update(notifications).set({ is_read: true }).where(eq(notifications.id, id));
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  await requirePilotActor();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return;
  await db.update(notifications).set({ is_read: true }).where(eq(notifications.user_id, userId));
  revalidatePath("/", "layout");
}
