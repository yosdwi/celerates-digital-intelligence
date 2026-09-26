"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { clients } from "@/db/schema";

export async function createClient(name: string, code: string) {
  await requirePilotActor();

  const [created] = await db.insert(clients).values({ name, code: code.toUpperCase() }).returning();
  return created;
}