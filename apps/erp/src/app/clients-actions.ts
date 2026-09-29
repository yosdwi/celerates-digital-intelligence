"use server";
import { requireActor } from "@/lib/actor";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { db } from "@/db";
import { clients } from "@/db/schema";

export async function createClient(name: string, code: string) {
  await requireActor();
  await requireDivisionAccess("sales");

  const [created] = await db.insert(clients).values({ name, code: code.toUpperCase() }).returning();
  return created;
}