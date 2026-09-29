// The signed-in user as a review actor: ERP-loaded identity and division levels (never client claims alone).
import { sql } from "@/db";
import { requirePilotActor } from "@/lib/actor";
import { loadActor } from "@/lib/agent/reads";
import type { ReviewActor } from "./queue";

export async function sessionReviewActor(): Promise<ReviewActor> {
  const pilot = await requirePilotActor();
  return loadActor(sql, pilot.id);
}
