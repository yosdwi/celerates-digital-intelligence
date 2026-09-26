"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { opportunities, requisitions, onboardingRequests } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

/**
 * TA klik ini setelah talent onboard -- BUKAN bikin PQ baru, tapi
 * menandai PQ Tracker yang SUDAH ADA (dibuat waktu Opportunity Tracker
 * qualified) jadi "siap di-generate". 1 Opportunity = 1 baris PQ Tracker,
 * dari awal sampai akhir.
 */
export async function notifyTalentOnboarded(onboardingRequestId: string) {
  await requirePilotActor();

  const [onboarding] = await db.select().from(onboardingRequests).where(eq(onboardingRequests.id, onboardingRequestId));
  if (!onboarding || !onboarding.requisition_id) {
    throw new Error("Onboarding atau Requisition terkait tidak ditemukan");
  }

  const [requisition] = await db.select().from(requisitions).where(eq(requisitions.id, onboarding.requisition_id));
  if (!requisition || !requisition.opportunity_id) {
    throw new Error("Requisition ini tidak terhubung ke Opportunity Tracker manapun");
  }

  const [pqRow] = await db.select().from(opportunities).where(eq(opportunities.opportunity_tracker_id, requisition.opportunity_id));
  if (!pqRow) {
    throw new Error("Belum ada baris PQ Tracker untuk Opportunity ini -- kemungkinan Requisition ini dibuat sebelum fitur ini ada.");
  }

  await db.update(opportunities).set({
    onboarding_request_id: onboardingRequestId,
  }).where(eq(opportunities.id, pqRow.id));

  revalidatePath("/sales");
  revalidatePath("/ta/onboarding");
}