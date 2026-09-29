"use server";
// Tinjau badge: how many ERP records are waiting for the signed-in user's decision.
import { sql } from "@/db";
import { requireActor } from "@/lib/actor";
import { reviewQueue } from "@/lib/review/queue";
import { conformReviewItems } from "@/lib/review/conform";
import { sessionReviewActor } from "@/lib/review/session";

export async function getReviewCount(): Promise<number> {
  await requireActor();
  try {
    const actor = await sessionReviewActor();
    const [erp, conform] = await Promise.all([reviewQueue(sql, actor), conformReviewItems(actor)]);
    return erp.length + conform.items.length;
  } catch {
    return 0;
  }
}
