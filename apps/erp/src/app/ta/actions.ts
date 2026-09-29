"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { requisitions, salesOpportunityTrackers, opportunities } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { applications } from "@/db/schema";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { logActivity } from "@/lib/activity-log";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { generateRequisitionNo, generateOptyNo } from "@/lib/id-generators";

export async function createRequisition(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  const client_name = formData.get("client_name") as string;
  const position_name = formData.get("position_name") as string;
  const service_type_code = formData.get("service_type_code") as string;
  const level_code = formData.get("level_code") as string;
  const opty_status_code = formData.get("opty_status_code") as string;
  const headcount_target = formData.get("headcount_target") as string;
  const priority_code = formData.get("priority_code") as string;
  const price_amount = formData.get("price_amount") as string;
  const estimated_duration_months = formData.get("estimated_duration_months") as string;
  const opty_request_date = (formData.get("opty_request_date") as string) || new Date().toISOString().slice(0, 10);
  const ta_pic_name = formData.get("ta_pic_name") as string;
  const sales_pic_name = formData.get("sales_pic_name") as string;
  const notes = formData.get("notes") as string;

  const requisition_no = await generateRequisitionNo();

  // Requisition yang dibuat langsung oleh TA (bukan hasil convert dari Sales
  // Opportunity Tracker) tetap butuh ID Opty yang valid -- jadi ikut bikinin
  // Opportunity Tracker + Opportunity minimal di belakang layar, dengan pola
  // yang sama seperti saat Sales convert (lihat sales/opportunity-tracker/actions.ts).
  const opty_no = await generateOptyNo();

  await db.transaction(async (tx) => {
    const [tracker] = await tx.insert(salesOpportunityTrackers).values({
      opty_no,
      client_name,
      position_name,
      service_type_code: service_type_code || null,
      level_code: level_code || null,
      headcount_target: headcount_target ? Number(headcount_target) : 1,
      price_amount: price_amount ? Number(price_amount) : null,
      estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
      sales_pic_name: sales_pic_name || "-",
    }).returning();

    await tx.insert(opportunities).values({
      opty_no,
      opty_request_date,
      client_name,
      project_name: position_name,
      position_name,
      service_type_code: service_type_code || "outsourcing",
      level_code: level_code || null,
      headcount_target: headcount_target ? Number(headcount_target) : 1,
      priority_code: priority_code || "p2",
      price_amount: price_amount ? Number(price_amount) : null,
      estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
      sales_pic_name: sales_pic_name || "-",
      pipeline_stage_code: "on_going",
      opportunity_tracker_id: tracker.id,
    });

    await tx.insert(requisitions).values({
      requisition_no,
      opportunity_id: tracker.id,
      client_name, position_name,
      service_type_code: service_type_code || null,
      level_code: level_code || null,
      opty_status_code: opty_status_code || null,
      headcount_target: headcount_target ? Number(headcount_target) : 1,
      priority_code: priority_code || "p2",
      price_amount: price_amount ? Number(price_amount) : null,
      estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
      opty_request_date,
      ta_pic_name,
      sales_pic_name: sales_pic_name || null,
      notes,
    });
  });

  await logActivity("ta", "create", `Requisition: ${client_name} — ${position_name}`, "Requisition");
  revalidatePath("/ta");
  revalidatePath("/sales/opportunity-tracker");
}

export async function updateRequisition(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("ta");
  const client_name = formData.get("client_name") as string;
  const position_name = formData.get("position_name") as string;
  const service_type_code = formData.get("service_type_code") as string;
  const level_code = formData.get("level_code") as string;
  const opty_status_code = formData.get("opty_status_code") as string;
  const headcount_target = formData.get("headcount_target") as string;
  const priority_code = formData.get("priority_code") as string;
  const price_amount = formData.get("price_amount") as string;
  const estimated_duration_months = formData.get("estimated_duration_months") as string;
  const opty_request_date = formData.get("opty_request_date") as string;
  const ta_pic_name = formData.get("ta_pic_name") as string;
  const sales_pic_name = formData.get("sales_pic_name") as string;
  const notes = formData.get("notes") as string;

  const price_amount_value = price_amount ? Number(price_amount) : null;

  const [req] = await db.update(requisitions).set({
    client_name, position_name,
    service_type_code: service_type_code || null,
    level_code: level_code || null,
    opty_status_code: opty_status_code || null,
    headcount_target: headcount_target ? Number(headcount_target) : 1,
    priority_code: priority_code || "p2",
    price_amount: price_amount_value,
    estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
    opty_request_date: opty_request_date || null,
    ta_pic_name,
    sales_pic_name: sales_pic_name || null,
    notes,
  }).where(eq(requisitions.id, id)).returning();

  // Harga yang diedit TA di sini harus balik ngisi "Closing Price Deal"
  // (kolom estimated_deal_amount) di Sales Opportunity Tracker asalnya --
  // supaya kedua sisi (TA & Sales) selalu lihat angka closing yang sama,
  // tanpa TA harus balik ke halaman Sales buat update manual.
  if (req?.opportunity_id) {
    await db.update(salesOpportunityTrackers)
      .set({ estimated_deal_amount: price_amount_value })
      .where(eq(salesOpportunityTrackers.id, req.opportunity_id));
  }

  await logActivity("ta", "update", `Requisition: ${client_name} — ${position_name}`, "Requisition");
  revalidatePath("/ta");
  revalidatePath("/sales/opportunity-tracker");
  await markSaved();
  redirect("/ta");
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteRequisition(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("ta", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const linked = await db.select().from(applications).where(eq(applications.requisition_id, id));
  if (linked.length > 0) {
    return { ok: false, error: "Requisition ini sudah punya candidate di Hiring Pipeline, tidak bisa dihapus." };
  }
  const [req] = await db.select().from(requisitions).where(eq(requisitions.id, id));
  await db.delete(requisitions).where(eq(requisitions.id, id));
  await logActivity("ta", "delete", `Requisition: ${req?.client_name ?? id} — ${req?.position_name ?? ""}`, "Requisition");
  revalidatePath("/ta");
  return { ok: true };
}