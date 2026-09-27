"use server";
// Tinjau badge: how many ERP records are waiting for the signed-in user's decision.
import { sql } from "@/db";
import { requirePilotActor } from "@/lib/actor";
import { reviewQueue } from "@/lib/review/queue";
import { sessionReviewActor } from "@/lib/review/session";

export async function getReviewCount(): Promise<number> {
  await requirePilotActor();
  try {
    return (await reviewQueue(sql, await sessionReviewActor())).length;
  } catch {
    return 0;
  }
}
