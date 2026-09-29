"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { salesOpportunityTrackers, requisitions, opportunities } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity-log";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { generateRequisitionNo, generateOptyNo } from "@/lib/id-generators";
import { markSaved } from "@/lib/saved-flag";


export async function createOpportunityTracker(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  const lead_id = (formData.get("lead_id") as string) || null;
  const client_name = formData.get("client_name") as string;
  const service_type_code = formData.get("service_type_code") as string;
  const requirement_summary = formData.get("requirement_summary") as string;
  const opty_status_code = (formData.get("opty_status_code") as string) || "cv_submission";
  const progress_notes = formData.get("progress_notes") as string;
  const estimated_deal_amount = formData.get("estimated_deal_amount") as string;
  const detail_requirement = formData.get("detail_requirement") as string;
  const client_type_code = formData.get("client_type_code") as string;
  const sales_pic_name = formData.get("sales_pic_name") as string;
  const last_communication_date = formData.get("last_communication_date") as string;
  const bante_score = formData.get("bante_score") as string;
  const sales_qualified = formData.get("sales_qualified") === "true";
  const position_name = formData.get("position_name") as string;
  const level_code = formData.get("level_code") as string;
  const headcount_target = formData.get("headcount_target") as string;
  const price_amount = formData.get("price_amount") as string;
  const price_period_code = formData.get("price_period_code") as string;
  const estimated_duration_months = formData.get("estimated_duration_months") as string;

  await db.insert(salesOpportunityTrackers).values({
    opty_no: await generateOptyNo(),
    lead_id,
    sales_qualified,
    client_name,
    service_type_code: service_type_code || null,
    requirement_summary: requirement_summary || null,
    opty_status_code,
    progress_notes: progress_notes || null,
    estimated_deal_amount: estimated_deal_amount ? Number(estimated_deal_amount) : null,
    detail_requirement: detail_requirement || null,
    client_type_code: client_type_code || null,
    sales_pic_name,
    last_communication_date: last_communication_date || null,
    bante_score: bante_score ? Number(bante_score) : null,
    position_name: position_name || null,
    level_code: level_code || null,
    headcount_target: headcount_target ? Number(headcount_target) : null,
    price_amount: price_amount ? Number(price_amount) : null,
    price_period_code: price_period_code || "monthly",
    estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
  });

  await logActivity("sales", "create", `Opportunity Tracker: ${client_name}`, "Opportunity Tracker");
  revalidatePath("/sales/opportunity-tracker");
}

export async function updateOpportunityTracker(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  const client_name = formData.get("client_name") as string;
  const service_type_code = formData.get("service_type_code") as string;
  const requirement_summary = formData.get("requirement_summary") as string;
  const opty_status_code = formData.get("opty_status_code") as string;
  const progress_notes = formData.get("progress_notes") as string;
  const estimated_deal_amount = formData.get("estimated_deal_amount") as string;
  const detail_requirement = formData.get("detail_requirement") as string;
  const client_type_code = formData.get("client_type_code") as string;
  const sales_pic_name = formData.get("sales_pic_name") as string;
  const last_communication_date = formData.get("last_communication_date") as string;
  const bante_score = formData.get("bante_score") as string;
  const sales_qualified = formData.get("sales_qualified") === "true";
  const dropped_reason = formData.get("dropped_reason") as string;
  const position_name = formData.get("position_name") as string;
  const level_code = formData.get("level_code") as string;
  const headcount_target = formData.get("headcount_target") as string;
  const price_amount = formData.get("price_amount") as string;
  const price_period_code = formData.get("price_period_code") as string;
  const estimated_duration_months = formData.get("estimated_duration_months") as string;

  await db.update(salesOpportunityTrackers).set({
    client_name,
    service_type_code: service_type_code || null,
    requirement_summary: requirement_summary || null,
    opty_status_code,
    progress_notes: progress_notes || null,
    estimated_deal_amount: estimated_deal_amount ? Number(estimated_deal_amount) : null,
    detail_requirement: detail_requirement || null,
    client_type_code: client_type_code || null,
    sales_pic_name,
    last_communication_date: last_communication_date || null,
    bante_score: bante_score ? Number(bante_score) : null,
    sales_qualified,
    dropped_reason: dropped_reason || null,
    position_name: position_name || null,
    level_code: level_code || null,
    headcount_target: headcount_target ? Number(headcount_target) : null,
    price_amount: price_amount ? Number(price_amount) : null,
    price_period_code: price_period_code || "monthly",
    estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
  }).where(eq(salesOpportunityTrackers.id, id));

  await logActivity("sales", "update", `Opportunity Tracker: ${client_name}`, "Opportunity Tracker");
  revalidatePath("/sales/opportunity-tracker");
  await markSaved();
  redirect("/sales/opportunity-tracker");
}

export async function updateSalesQualified(id: string, sales_qualified: boolean) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  await db.update(salesOpportunityTrackers).set({ sales_qualified }).where(eq(salesOpportunityTrackers.id, id));
  await logActivity("sales", "update", `Sales Qualified diubah jadi ${sales_qualified}`, "Opportunity Tracker");
  revalidatePath("/sales/opportunity-tracker");
}

export async function updateOptyStatus(id: string, opty_status_code: string) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  await db.update(salesOpportunityTrackers).set({ opty_status_code }).where(eq(salesOpportunityTrackers.id, id));
  await logActivity("sales", "update", `Opty Status diubah jadi ${opty_status_code}`, "Opportunity Tracker");
  revalidatePath("/sales/opportunity-tracker");
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteOpportunityTracker(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("sales", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const linked = await db.select().from(requisitions).where(eq(requisitions.opportunity_id, id));
  if (linked.length > 0) {
    return { ok: false, error: "Opportunity ini sudah di-convert jadi Requisition, tidak bisa dihapus." };
  }
  // Tracker hasil "Add Extension Request" nggak pernah lewat Requisition (cek
  // di atas nggak nangkep dia) -- tapi dia tetap punya PQ Tracker (opportunities)
  // yang nempel, jadi harus dicegah juga biar nggak jadi data yatim.
  const [linkedOpty] = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.opportunity_tracker_id, id)).limit(1);
  if (linkedOpty) {
    return { ok: false, error: "Opportunity ini sudah punya PQ Tracker, tidak bisa dihapus." };
  }
  const [tracker] = await db.select().from(salesOpportunityTrackers).where(eq(salesOpportunityTrackers.id, id));
  await db.delete(salesOpportunityTrackers).where(eq(salesOpportunityTrackers.id, id));
  await logActivity("sales", "delete", `Opportunity Tracker: ${tracker?.client_name ?? id}`, "Opportunity Tracker");
  revalidatePath("/sales/opportunity-tracker");
  revalidatePath("/marketing");
  return { ok: true };
}


export async function convertToRequisition(opportunityTrackerId: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  const existing = await db.select().from(requisitions).where(eq(requisitions.opportunity_id, opportunityTrackerId));
  if (existing.length > 0) {
    redirect("/ta");
  }
  // Tracker dari "Add Extension Request" nggak punya Requisition (cek di atas
  // nggak nangkep dia) tapi PQ Tracker-nya udah ada -- convert lagi bakal
  // bentrok sama unique constraint opty_no, jadi ditolak eksplisit di sini juga.
  const [existingOpty] = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.opportunity_tracker_id, opportunityTrackerId)).limit(1);
  if (existingOpty) {
    throw new Error("Opportunity ini sudah punya PQ Tracker, tidak bisa di-convert lagi.");
  }

  const [tracker] = await db.select().from(salesOpportunityTrackers).where(eq(salesOpportunityTrackers.id, opportunityTrackerId));
  if (!tracker) throw new Error("Opportunity Tracker tidak ditemukan");

  // Kalau TA nggak isi manual di form Convert, pakai data yang udah ada
  // di Opportunity Tracker sebagai default.
  const positionInput = formData.get("position_name") as string;
  const headcountInput = formData.get("headcount_target") as string;
  const priorityInput = formData.get("priority_code") as string;
  const priceInput = formData.get("price_amount") as string;
  const position_name = positionInput || tracker.position_name || "-";
  const headcount_target = headcountInput ? Number(headcountInput) : (tracker.headcount_target ?? 1);
  const priority_code = priorityInput || "p2";
  const price_amount = priceInput ? Number(priceInput) : tracker.price_amount;
  // Opty Request Date = tanggal saat sales melakukan convert, bukan input manual.
  const opty_request_date = new Date().toISOString().slice(0, 10);
  // Opty No HARUS sama dengan punya Opportunity Tracker asal, supaya bisa
  // ditrack dari hulu (Opportunity Tracker) ke hilir (PQ Tracker & Requisition).
  const opty_no = tracker.opty_no;

  const requisition_no = await generateRequisitionNo();

  await db.transaction(async (tx) => {
    await tx.insert(requisitions).values({
      requisition_no,
      opportunity_id: opportunityTrackerId,
      opty_request_date,
      client_name: tracker.client_name,
      position_name,
      service_type_code: tracker.service_type_code,
      level_code: tracker.level_code,
      headcount_target,
      priority_code,
      price_amount,
      estimated_duration_months: tracker.estimated_duration_months,
      // TA PIC belum ditentukan saat convert -- dulu ini ketimpa nama Sales PIC,
      // sekarang harus di-set manual oleh tim TA lewat halaman Edit Requisition.
      ta_pic_name: "Belum Ditentukan",
      sales_pic_name: tracker.sales_pic_name,
      notes: tracker.requirement_summary ?? null,
    });

    // Semua field ini SEMUA otomatis kecopy dari Opportunity Tracker --
    // tetap editable belakangan di halaman Edit PQ Tracker kalau ada beda.
    await tx.insert(opportunities).values({
      opty_no,
      opty_request_date,
      client_name: tracker.client_name,
      client_type_code: tracker.client_type_code,
      project_name: position_name,
      position_name,
      service_type_code: tracker.service_type_code ?? "outsourcing",
      level_code: tracker.level_code,
      headcount_target,
      priority_code,
      bant_score: tracker.bante_score,
      price_amount,
      estimated_duration_months: tracker.estimated_duration_months,
      sales_pic_name: tracker.sales_pic_name,
      pipeline_stage_code: "on_going",
      opportunity_tracker_id: opportunityTrackerId,
    });
  });

  await logActivity("sales", "create", `${tracker.client_name} — ${position_name} dikonversi jadi Requisition & PQ Tracker`, "Opportunity Tracker");
  revalidatePath("/ta");
  revalidatePath("/sales");
  await markSaved();
  redirect("/ta");
}