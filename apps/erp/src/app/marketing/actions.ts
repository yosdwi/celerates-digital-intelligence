"use server";
import { requirePilotActor } from "@/lib/actor";

import { db } from "@/db";
import { leads, opportunities, salesOpportunityTrackers } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { logActivity } from "@/lib/activity-log";
import { requireDivisionAccess } from "@/lib/require-division-access";

/**
 * Format: {CLIENT}-{SOURCE}-{TAHUN}-{NOMOR3DIGIT}
 * Contoh: ASTRA-ADS-2026-003
 * Cek-dan-ulang ke DB biar nggak gampang tabrakan.
 */
export async function generateLeadNo(clientName: string, sourceCode: string): Promise<string> {
  await requirePilotActor();

  const clientSlug = clientName.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "CLIENT";
  const sourceSlug = sourceCode.toUpperCase().slice(0, 4);
  const year = new Date().getFullYear();
  for (let i = 0; i < 5; i++) {
    const seq = String(Math.floor(1 + Math.random() * 999)).padStart(3, "0");
    const candidate = `${clientSlug}-${sourceSlug}-${year}-${seq}`;
    const existing = await db.select().from(leads).where(eq(leads.lead_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `${clientSlug}-${sourceSlug}-${year}-${Date.now()}`;
}

export async function createLead(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("marketing");
  const client_name = formData.get("client_name") as string;
  const contact_name = formData.get("contact_name") as string;
  const contact_email = formData.get("contact_email") as string;
  const contact_phone = formData.get("contact_phone") as string;
  const company_size = formData.get("company_size") as string;
  const industry_code = formData.get("industry_code") as string;
  const service_type_code = formData.get("service_type_code") as string;
  const lead_source_code = formData.get("lead_source_code") as string;
  const category_code = formData.get("category_code") as string;
  const sales_pic_name = formData.get("sales_pic_name") as string;
  const notes = formData.get("notes") as string;
  const qualifyStatus = formData.get("is_qualified") as string;
  const disqualify_reason = formData.get("disqualify_reason") as string;
  const project_name = formData.get("project_name") as string;
  const price_amount = formData.get("price_amount") as string;
  const price_period_code = formData.get("price_period_code") as string;
  const position_name = formData.get("position_name") as string;
  const headcount_target = formData.get("headcount_target") as string;
  const level_code = formData.get("level_code") as string;
  const estimated_duration_months = formData.get("estimated_duration_months") as string;

  await db.insert(leads).values({
    lead_no: await generateLeadNo(client_name, lead_source_code),
    client_name,
    contact_name,
    contact_email,
    contact_phone,
    company_size: company_size ? Number(company_size) : null,
    industry_code,
    service_type_code,
    lead_source_code,
    category_code,
    sales_pic_name,
    notes,
    is_qualified: qualifyStatus === "" ? null : qualifyStatus === "true",
    disqualify_reason,
    project_name,
    price_amount: price_amount ? Number(price_amount) : null,
    price_period_code: price_period_code || "monthly",
    position_name: position_name || null,
    headcount_target: headcount_target ? Number(headcount_target) : null,
    level_code: level_code || null,
    estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
  });

  await logActivity("marketing", "create", `Lead: ${client_name}`, "Leads");
  revalidatePath("/marketing");
}

/**
 * Update lead. lead_no TIDAK diubah -- itu identitas permanen begitu dibuat,
 * sama seperti nomor invoice yang tidak boleh berubah.
 */
export async function updateLead(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("marketing");
  const client_name = formData.get("client_name") as string;
  const contact_name = formData.get("contact_name") as string;
  const contact_email = formData.get("contact_email") as string;
  const contact_phone = formData.get("contact_phone") as string;
  const company_size = formData.get("company_size") as string;
  const industry_code = formData.get("industry_code") as string;
  const service_type_code = formData.get("service_type_code") as string;
  const lead_source_code = formData.get("lead_source_code") as string;
  const category_code = formData.get("category_code") as string;
  const sales_pic_name = formData.get("sales_pic_name") as string;
  const notes = formData.get("notes") as string;
  const qualifyStatus = formData.get("is_qualified") as string;
  const disqualify_reason = formData.get("disqualify_reason") as string;
  const project_name = formData.get("project_name") as string;
  const price_amount = formData.get("price_amount") as string;
  const price_period_code = formData.get("price_period_code") as string;
  const position_name = formData.get("position_name") as string;
  const headcount_target = formData.get("headcount_target") as string;
  const level_code = formData.get("level_code") as string;
  const estimated_duration_months = formData.get("estimated_duration_months") as string;

  await db.update(leads).set({
    client_name,
    contact_name,
    contact_email,
    contact_phone,
    company_size: company_size ? Number(company_size) : null,
    industry_code,
    service_type_code,
    lead_source_code,
    category_code,
    sales_pic_name,
    notes,
    is_qualified: qualifyStatus === "" ? null : qualifyStatus === "true",
    disqualify_reason,
    project_name,
    price_amount: price_amount ? Number(price_amount) : null,
    price_period_code: price_period_code || "monthly",
    position_name: position_name || null,
    headcount_target: headcount_target ? Number(headcount_target) : null,
    level_code: level_code || null,
    estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
  }).where(eq(leads.id, id));

  await logActivity("marketing", "update", `Lead: ${client_name}`, "Leads");
  revalidatePath("/marketing");
  await markSaved();
  redirect("/marketing");
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

/**
 * Cek dulu apakah lead ini sudah di-convert ke Opportunity Tracker sebelum
 * hapus -- daripada biarkan Postgres lempar error foreign key mentah.
 */
export async function deleteLead(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("marketing", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const linked = await db.select().from(salesOpportunityTrackers).where(eq(salesOpportunityTrackers.lead_id, id));
  if (linked.length > 0) {
    return { ok: false, error: "Lead ini sudah di-convert jadi Opportunity Tracker, tidak bisa dihapus." };
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  await db.delete(leads).where(eq(leads.id, id));
  await logActivity("marketing", "delete", `Lead: ${lead?.client_name ?? id}`, "Leads");
  revalidatePath("/marketing");
  return { ok: true };
}

async function generateOptyNo(clientName: string): Promise<string> {
  const slug = clientName.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "CLIENT";
  const year = new Date().getFullYear();
  for (let i = 0; i < 5; i++) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${slug}-${rand}-${year}`;
    const existing = await db.select().from(salesOpportunityTrackers).where(eq(salesOpportunityTrackers.opty_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `${slug}-${Date.now()}-${year}`;
}

export type ConvertResult = { ok: true } | { ok: false; error: string };

/**
 * Convert Lead (Marketing) -> Opportunity Tracker (Sales), BUKAN langsung
 * ke PQ Tracker. PQ Tracker baru kebuat belakangan, begitu Opportunity
 * Tracker ini ditandai Sales Qualified (lihat convertToRequisition di
 * sales/opportunity-tracker/actions.ts).
 *
 * Nama project & harga sudah diisi pas Lead dibuat -- convert di sini
 * murni konfirmasi, tanpa field tambahan yang harus diisi lagi.
 */
export async function convertLeadToOpportunity(leadId: string): Promise<ConvertResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("marketing");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const [sourceLead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!sourceLead) return { ok: false, error: "Lead tidak ditemukan" };
  // Generate outside the transaction: generator uses the shared DB pool.
  const optyNo = await generateOptyNo(sourceLead.client_name);
  const result = await db.transaction(async (tx): Promise<ConvertResult> => {
  const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId)).for("update");
  if (!lead) return { ok: false, error: "Lead tidak ditemukan" };
  if (!lead.is_qualified) return { ok: false, error: "Lead ini belum Qualified" };

  const existing = await tx.select().from(salesOpportunityTrackers).where(eq(salesOpportunityTrackers.lead_id, leadId));
  if (existing.length > 0) return { ok: false, error: "Lead ini sudah pernah di-convert" };

  if (!lead.project_name || lead.project_name.trim().length < 2) {
    return { ok: false, error: "Nama project belum diisi -- lengkapi dulu lewat Edit Lead" };
  }

  await tx.insert(salesOpportunityTrackers).values({
    lead_id: lead.id,
    opty_no: optyNo,
    client_name: lead.client_name,
    service_type_code: lead.service_type_code,
    requirement_summary: lead.project_name,
    estimated_deal_amount: lead.price_amount,
    sales_pic_name: lead.sales_pic_name,
    estimated_duration_months: lead.estimated_duration_months,
    position_name: lead.position_name,
    headcount_target: lead.headcount_target,
    level_code: lead.level_code,
    price_amount: lead.price_amount,
    price_period_code: lead.price_period_code,
    sales_qualified: false,
    opty_status_code: "cv_submission",
  });

    return { ok: true };
  });
  if (!result.ok) return result;
  await logActivity("marketing", "update", `Lead ${leadId} dikonversi ke Opportunity Tracker`, "Leads");
  revalidatePath("/marketing");
  revalidatePath("/sales/opportunity-tracker");
  return { ok: true };
}