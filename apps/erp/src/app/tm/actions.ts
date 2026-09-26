"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { talentAssignments, extensionIncrementRequests, users } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { startExtensionRequestJourney, ownerOverrideExtensionRequestJourney, reconcileApprovalStepChange, APPROVAL_STEPS, EXTENSION_REQUEST_SOURCE } from "@/lib/approval-journey";
import { saveAttachmentsAndLinks, deleteAttachment, extractFiles, extractLinks } from "@/lib/attachments";
import { uploadDocument } from "@/lib/storage";
import { randomUUID } from "crypto";
import { requireDivisionAccess } from "@/lib/require-division-access";

// ---------- Talent Assignment ----------

/** Performance Appraisal/Review bisa diisi link ATAU upload dokumen -- ambil file kalau ada, fallback ke link teks. */
async function resolvePerformanceUrl(formData: FormData, urlField: string, fileField: string, uploadId: string): Promise<string | null> {
  const file = formData.get(fileField) as File | null;
  if (file && file.size > 0) return await uploadDocument(file, uploadId, urlField);
  return (formData.get(urlField) as string) || null;
}

export async function createTalentAssignment(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("tm");
  const employee_id = formData.get("employee_id") as string;
  const requisition_id = formData.get("requisition_id") as string;
  const start_date = formData.get("start_date") as string;
  const end_date = formData.get("end_date") as string;
  const status_code = formData.get("status_code") as string;
  const talent_track_code = formData.get("talent_track_code") as string;
  const increment_date = formData.get("increment_date") as string;
  const current_grading = formData.get("current_grading") as string;
  const current_salary_grade_code = formData.get("current_salary_grade_code") as string;
  const price_amount = formData.get("price_amount") as string;
  const current_skill = formData.get("current_skill") as string;
  const current_certification = formData.get("current_certification") as string;
  const uploadId = randomUUID();
  const performance_appraisal_result = await resolvePerformanceUrl(formData, "performance_appraisal_result", "performance_appraisal_result_file", uploadId);
  const performance_review_result = await resolvePerformanceUrl(formData, "performance_review_result", "performance_review_result_file", uploadId);
  const people_summarize = formData.get("people_summarize") as string;
  const increment_amount_deal = formData.get("increment_amount_deal") as string;
  const increment_percent_deal = formData.get("increment_percent_deal") as string;
  const status_all_data_code = formData.get("status_all_data_code") as string;
  const notes = formData.get("notes") as string;
  const basic_salary_amount = formData.get("basic_salary_amount") as string;
  const functional_allowance_amount = formData.get("functional_allowance_amount") as string;
  const transport_allowance_amount = formData.get("transport_allowance_amount") as string;
  const project_allowance_amount = formData.get("project_allowance_amount") as string;
  const accommodation_allowance_amount = formData.get("accommodation_allowance_amount") as string;
  const field_allowance_amount = formData.get("field_allowance_amount") as string;
  const overtime_allowance_amount = formData.get("overtime_allowance_amount") as string;
  const pq_tracker_id = formData.get("pq_tracker_id") as string;

  if (!employee_id) throw new Error("Employee wajib dipilih");

  await db.insert(talentAssignments).values({
    employee_id,
    requisition_id: requisition_id || null,
    start_date: start_date || null,
    end_date: end_date || null,
    status_code: status_code || null,
    talent_track_code: talent_track_code || null,
    increment_date: increment_date || null,
    current_grading: current_grading || null,
    current_salary_grade_code: current_salary_grade_code || null,
    price_amount: price_amount ? Number(price_amount) : null,
    current_skill: current_skill || null,
    current_certification: current_certification || null,
    performance_appraisal_result: performance_appraisal_result || null,
    performance_review_result: performance_review_result || null,
    people_summarize: people_summarize || null,
    increment_amount_deal: increment_amount_deal ? Number(increment_amount_deal) : null,
    increment_percent_deal: increment_percent_deal ? Number(increment_percent_deal) : null,
    status_all_data_code: status_all_data_code || null,
    notes,
    basic_salary_amount: basic_salary_amount ? Number(basic_salary_amount) : null,
    functional_allowance_amount: functional_allowance_amount ? Number(functional_allowance_amount) : null,
    transport_allowance_amount: transport_allowance_amount ? Number(transport_allowance_amount) : null,
    project_allowance_amount: project_allowance_amount ? Number(project_allowance_amount) : null,
    accommodation_allowance_amount: accommodation_allowance_amount ? Number(accommodation_allowance_amount) : null,
    field_allowance_amount: field_allowance_amount ? Number(field_allowance_amount) : null,
    overtime_allowance_amount: overtime_allowance_amount ? Number(overtime_allowance_amount) : null,
    pq_tracker_id: pq_tracker_id || null,
  });

  await logActivity("tm", "create", "Talent Assignment baru", "Talents Book");
  revalidatePath("/tm");
}

export async function updateTalentAssignment(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("tm");
  const requisition_id = formData.get("requisition_id") as string;
  const start_date = formData.get("start_date") as string;
  const end_date = formData.get("end_date") as string;
  const status_code = formData.get("status_code") as string;
  const talent_track_code = formData.get("talent_track_code") as string;
  const increment_date = formData.get("increment_date") as string;
  const current_grading = formData.get("current_grading") as string;
  const current_salary_grade_code = formData.get("current_salary_grade_code") as string;
  const current_skill = formData.get("current_skill") as string;
  const current_certification = formData.get("current_certification") as string;
  const performance_appraisal_result = await resolvePerformanceUrl(formData, "performance_appraisal_result", "performance_appraisal_result_file", id);
  const performance_review_result = await resolvePerformanceUrl(formData, "performance_review_result", "performance_review_result_file", id);
  const people_summarize = formData.get("people_summarize") as string;
  const increment_amount_deal = formData.get("increment_amount_deal") as string;
  const increment_percent_deal = formData.get("increment_percent_deal") as string;
  const status_all_data_code = formData.get("status_all_data_code") as string;
  const notes = formData.get("notes") as string;
  const pq_tracker_id = formData.get("pq_tracker_id") as string;

  // Field-field salary/tax/allowance/BPJS di bawah ini nggak lagi dirender
  // sebagai input di form Edit Talent Assignment (sekarang cuma bisa diisi
  // lewat "Terapkan ke Talents Book" di COGS Calculator, lihat
  // src/app/tm/cogs-calculator/actions.ts). Karena itu field-field ini WAJIB
  // absen sepenuhnya dari FormData saat submit dari form ini -- jangan sampai
  // ke-treat sebagai "dikosongkan" dan menimpa nilai yang sudah tersimpan.
  // Makanya di sini pakai formData.has(key), bukan formData.get(key) ? ... : null,
  // supaya field yang benar-benar absen dari form nggak ikut di-update sama sekali.
  const COGS_MANAGED_FIELDS = [
    "price_amount", "basic_salary_amount", "functional_allowance_amount", "transport_allowance_amount",
    "project_allowance_amount", "accommodation_allowance_amount", "field_allowance_amount", "overtime_allowance_amount",
    "tax_bruto_amount", "gross_salary_amount", "take_home_pay_amount",
    "kompensasi_amount", "thr_allowance_amount", "annual_bonus_allowance_amount",
    "annual_medical_reimbursement_amount", "laptop_ownership_amount", "training_amount", "refreshment_amount",
    "bpjs_kesehatan_company_amount", "jkk_amount", "jkm_amount", "jht_company_amount", "jkp_amount", "jp_company_amount",
    "bpjs_kesehatan_employee_amount", "jht_employee_amount", "jp_employee_amount",
    "management_fee_amount",
  ] as const;
  const cogsManagedValues: Record<string, number | null> = {};
  for (const key of COGS_MANAGED_FIELDS) {
    if (!formData.has(key)) continue;
    const raw = formData.get(key) as string;
    cogsManagedValues[key] = raw ? Number(raw) : null;
  }

  await db.update(talentAssignments).set({
    requisition_id: requisition_id || null,
    start_date: start_date || null,
    end_date: end_date || null,
    status_code: status_code || null,
    talent_track_code: talent_track_code || null,
    increment_date: increment_date || null,
    current_grading: current_grading || null,
    current_salary_grade_code: current_salary_grade_code || null,
    current_skill: current_skill || null,
    current_certification: current_certification || null,
    performance_appraisal_result: performance_appraisal_result || null,
    performance_review_result: performance_review_result || null,
    people_summarize: people_summarize || null,
    increment_amount_deal: increment_amount_deal ? Number(increment_amount_deal) : null,
    increment_percent_deal: increment_percent_deal ? Number(increment_percent_deal) : null,
    status_all_data_code: status_all_data_code || null,
    notes,
    pq_tracker_id: pq_tracker_id || null,
    ...cogsManagedValues,
  }).where(eq(talentAssignments.id, id));

  await logActivity("tm", "update", "Talent Assignment diperbarui", "Talents Book");
  revalidatePath("/tm");
  await markSaved();
  redirect("/tm");
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteTalentAssignment(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("tm", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.delete(talentAssignments).where(eq(talentAssignments.id, id));
  await logActivity("tm", "delete", "Talent Assignment dihapus", "Talents Book");
  revalidatePath("/tm");
  return { ok: true };
}

// ---------- Extension & Increment Request ----------

export async function createExtensionRequest(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("tm");
  const employee_id = formData.get("employee_id") as string;
  const requisition_id = formData.get("requisition_id") as string;
  const propose_start_date = formData.get("propose_start_date") as string;
  const propose_end_date = formData.get("propose_end_date") as string;
  const proposed_position_name = formData.get("proposed_position_name") as string;
  const proposed_grade_level_code = formData.get("proposed_grade_level_code") as string;
  const proposed_employment_type_code = formData.get("proposed_employment_type_code") as string;
  const proposed_basic_salary_amount = formData.get("proposed_basic_salary_amount") as string;
  const proposed_transport_allowance_amount = formData.get("proposed_transport_allowance_amount") as string;
  const proposed_project_allowance_amount = formData.get("proposed_project_allowance_amount") as string;
  const proposed_accommodation_allowance_amount = formData.get("proposed_accommodation_allowance_amount") as string;
  const proposed_overtime_allowance_amount = formData.get("proposed_overtime_allowance_amount") as string;
  const proposed_increment_amount_deal = formData.get("proposed_increment_amount_deal") as string;
  const proposed_increment_percent_deal = formData.get("proposed_increment_percent_deal") as string;
  const requester_user_id = formData.get("requester_user_id") as string;
  const approver_1_user_id = (formData.get("approver_1_user_id") as string) || null;
  const approver_2_user_id = (formData.get("approver_2_user_id") as string) || null;
  const approver_3_user_id = (formData.get("approver_3_user_id") as string) || null;
  const acknowledger_user_id = (formData.get("acknowledger_user_id") as string) || null;
  const notes = formData.get("notes") as string;

  if (!employee_id) throw new Error("Employee wajib dipilih");
  if (!requester_user_id) throw new Error("Requester wajib dipilih");

  const [requesterUser] = await db.select({ full_name: users.full_name }).from(users).where(eq(users.id, requester_user_id));
  if (!requesterUser) throw new Error("Requester tidak ditemukan");

  const [{ id: newId }] = await db.insert(extensionIncrementRequests).values({
    employee_id,
    requisition_id: requisition_id || null,
    propose_start_date: propose_start_date || null,
    propose_end_date: propose_end_date || null,
    proposed_position_name: proposed_position_name || null,
    proposed_grade_level_code: proposed_grade_level_code || null,
    proposed_employment_type_code: proposed_employment_type_code || null,
    proposed_basic_salary_amount: proposed_basic_salary_amount ? Number(proposed_basic_salary_amount) : null,
    proposed_transport_allowance_amount: proposed_transport_allowance_amount ? Number(proposed_transport_allowance_amount) : null,
    proposed_project_allowance_amount: proposed_project_allowance_amount ? Number(proposed_project_allowance_amount) : null,
    proposed_accommodation_allowance_amount: proposed_accommodation_allowance_amount ? Number(proposed_accommodation_allowance_amount) : null,
    proposed_overtime_allowance_amount: proposed_overtime_allowance_amount ? Number(proposed_overtime_allowance_amount) : null,
    proposed_increment_amount_deal: proposed_increment_amount_deal ? Number(proposed_increment_amount_deal) : null,
    proposed_increment_percent_deal: proposed_increment_percent_deal ? Number(proposed_increment_percent_deal) : null,
    requester_name: requesterUser.full_name,
    requester_user_id,
    approver_1_user_id,
    approver_2_user_id,
    approver_3_user_id,
    acknowledger_user_id,
    notes,
    status_code: "pending",
  }).returning({ id: extensionIncrementRequests.id });

  const newFiles = extractFiles(formData, "attachments");
  const newLinks = extractLinks(formData, "attachments_links");
  if (newFiles.length > 0 || newLinks.length > 0) {
    await saveAttachmentsAndLinks(EXTENSION_REQUEST_SOURCE, newId, { files: newFiles, links: newLinks }, requesterUser.full_name);
  }

  await startExtensionRequestJourney(newId);

  await logActivity("tm", "create", `Extension Request oleh ${requesterUser.full_name}`, "Extension Request");
  revalidatePath("/tm/extension-requests");
}

export type UpdateExtensionRequestResult = { ok: true; blockedSteps: string[] } | { ok: false; error: string };

export async function updateExtensionRequest(id: string, formData: FormData): Promise<UpdateExtensionRequestResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("tm");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const [request] = await db.select().from(extensionIncrementRequests).where(eq(extensionIncrementRequests.id, id));
  if (!request) return { ok: false, error: "Request tidak ditemukan" };
  if (request.status_code !== "pending") {
    return { ok: false, error: "Request yang sudah Approved/Rejected tidak bisa diedit lagi" };
  }

  const propose_start_date = (formData.get("propose_start_date") as string) || null;
  const propose_end_date = (formData.get("propose_end_date") as string) || null;
  const proposed_position_name = (formData.get("proposed_position_name") as string) || null;
  const proposed_grade_level_code = (formData.get("proposed_grade_level_code") as string) || null;
  const proposed_employment_type_code = (formData.get("proposed_employment_type_code") as string) || null;
  const proposed_basic_salary_amount = formData.get("proposed_basic_salary_amount") as string;
  const proposed_transport_allowance_amount = formData.get("proposed_transport_allowance_amount") as string;
  const proposed_project_allowance_amount = formData.get("proposed_project_allowance_amount") as string;
  const proposed_accommodation_allowance_amount = formData.get("proposed_accommodation_allowance_amount") as string;
  const proposed_overtime_allowance_amount = formData.get("proposed_overtime_allowance_amount") as string;
  const proposed_increment_amount_deal = formData.get("proposed_increment_amount_deal") as string;
  const proposed_increment_percent_deal = formData.get("proposed_increment_percent_deal") as string;
  const notes = (formData.get("notes") as string) || null;

  const updateValues: Record<string, unknown> = {
    propose_start_date,
    propose_end_date,
    proposed_position_name,
    proposed_grade_level_code,
    proposed_employment_type_code,
    proposed_basic_salary_amount: proposed_basic_salary_amount ? Number(proposed_basic_salary_amount) : null,
    proposed_transport_allowance_amount: proposed_transport_allowance_amount ? Number(proposed_transport_allowance_amount) : null,
    proposed_project_allowance_amount: proposed_project_allowance_amount ? Number(proposed_project_allowance_amount) : null,
    proposed_accommodation_allowance_amount: proposed_accommodation_allowance_amount ? Number(proposed_accommodation_allowance_amount) : null,
    proposed_overtime_allowance_amount: proposed_overtime_allowance_amount ? Number(proposed_overtime_allowance_amount) : null,
    proposed_increment_amount_deal: proposed_increment_amount_deal ? Number(proposed_increment_amount_deal) : null,
    proposed_increment_percent_deal: proposed_increment_percent_deal ? Number(proposed_increment_percent_deal) : null,
    notes,
  };

  const blockedSteps: string[] = [];
  for (const step of APPROVAL_STEPS) {
    const raw = formData.get(step.userField) as string | null;
    const newUserId = raw || null;
    const result = await reconcileApprovalStepChange(request, step, newUserId);
    if (result.blocked) {
      blockedSteps.push(step.label);
      continue;
    }
    if (result.changed) {
      updateValues[step.userField] = newUserId;
    }
  }

  await db.update(extensionIncrementRequests).set(updateValues).where(eq(extensionIncrementRequests.id, id));

  const newFiles = extractFiles(formData, "attachments");
  const newLinks = extractLinks(formData, "attachments_links");
  if (newFiles.length > 0 || newLinks.length > 0) {
    await saveAttachmentsAndLinks(EXTENSION_REQUEST_SOURCE, id, { files: newFiles, links: newLinks }, request.requester_name);
  }

  await logActivity("tm", "update", `Extension Request diperbarui${blockedSteps.length ? ` (${blockedSteps.join(", ")} tidak diubah karena sudah TTD)` : ""}`, "Extension Request");
  revalidatePath("/tm/extension-requests");
  return { ok: true, blockedSteps };
}

export async function deleteExtensionRequestAttachment(attachmentId: string) {
  await requirePilotActor();

  await requireDivisionAccess("tm");
  await deleteAttachment(attachmentId);
  await logActivity("tm", "delete", "Lampiran Extension Request dihapus", "Extension Request");
  revalidatePath("/tm/extension-requests");
}

export async function ownerOverrideExtensionRequest(id: string) {
  await requirePilotActor();

  const session = await getServerSession(authOptions);
  const isOwner = Boolean((session?.user as any)?.isOwner);
  if (!isOwner) throw new Error("Hanya Owner yang bisa melakukan override approval");
  const ownerName = (session?.user as any)?.fullName ?? session?.user?.name ?? "Owner";

  await ownerOverrideExtensionRequestJourney(id, ownerName);

  await logActivity("tm", "update", `Extension Request di-approve langsung oleh Owner (${ownerName})`, "Extension Request");
  revalidatePath("/tm/extension-requests");
}

export async function rejectExtensionRequest(id: string) {
  await requirePilotActor();

  await requireDivisionAccess("tm");
  await db.update(extensionIncrementRequests).set({ status_code: "rejected" }).where(eq(extensionIncrementRequests.id, id));
  await logActivity("tm", "update", "Extension Request ditolak", "Extension Request");
  revalidatePath("/tm/extension-requests");
}

export async function deleteExtensionRequest(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("tm", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.delete(extensionIncrementRequests).where(eq(extensionIncrementRequests.id, id));
  await logActivity("tm", "delete", "Extension Request dihapus", "Extension Request");
  revalidatePath("/tm/extension-requests");
  return { ok: true };
}