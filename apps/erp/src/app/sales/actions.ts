"use server";
import { requirePilotActor } from "@/lib/actor";

import { db } from "@/db";
import { opportunities, requisitions, signatureRequests, projectDocuments, employees, extensionIncrementRequests, salesOpportunityTrackers } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { uploadDocument } from "@/lib/storage";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { createNotification, notifyDivision } from "@/lib/notifications";
import { saveAttachmentsAndLinks, extractFiles, extractLinks, deleteAttachment, getAttachmentsWithUrls } from "@/lib/attachments";
import { OPPORTUNITY_PO_DOC_SOURCE } from "./constants";
import { PQ_DOCUMENT_SOURCE, PQ_SIGNATURE_SOURCE, PQ_SIGNATURE_STEP } from "./pq-constants";
import { generateOptyNo, generateOptyNoWithPosition, generatePqNo } from "@/lib/id-generators";
import { requireDivisionAccess } from "@/lib/require-division-access";

export async function createOpportunity(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  const client_name = formData.get("client_name") as string;
  const client_type_code = formData.get("client_type_code") as string;
  const project_name = formData.get("project_name") as string;
  const position_name = formData.get("position_name") as string;
  const service_type_code = formData.get("service_type_code") as string;
  const business_unit_code = formData.get("business_unit_code") as string;
  const level_code = formData.get("level_code") as string;
  const headcount_target = formData.get("headcount_target") as string;
  const priority_code = formData.get("priority_code") as string;
  const bant_score = formData.get("bant_score") as string;
  const price_amount = formData.get("price_amount") as string;
  const price_period_code = formData.get("price_period_code") as string;
  const estimated_duration_months = formData.get("estimated_duration_months") as string;
  const opty_request_date = formData.get("opty_request_date") as string;
  const approval_date = formData.get("approval_date") as string;
  const start_date = formData.get("start_date") as string;
  const end_date = formData.get("end_date") as string;
  const po_doc_url_text = formData.get("po_doc_url") as string;
  const po_doc_file = formData.get("po_doc_file") as File | null;
  const sales_pic_name = formData.get("sales_pic_name") as string;
  const notes = formData.get("notes") as string;
  const pipeline_stage_code = (formData.get("pipeline_stage_code") as string) || "on_going";
  const opty_status_code = formData.get("opty_status_code") as string;

  const id = randomUUID();

  let po_doc_url: string | null = null;
  if (po_doc_file && po_doc_file.size > 0) {
    po_doc_url = await uploadDocument(po_doc_file, id, "po_doc");
  } else if (po_doc_url_text) {
    po_doc_url = po_doc_url_text;
  }

  await db.insert(opportunities).values({
    id,
    opty_no: await generateOptyNoWithPosition(client_name, position_name, business_unit_code),
    pq_no: await generatePqNo(client_name, position_name, business_unit_code),
    client_name,
    client_type_code: client_type_code || null,
    project_name,
    position_name: position_name || null,
    service_type_code,
    business_unit_code: business_unit_code || null,
    level_code: level_code || null,
    headcount_target: headcount_target ? Number(headcount_target) : null,
    priority_code: priority_code || null,
    bant_score: bant_score ? Number(bant_score) : null,
    price_amount: price_amount ? Number(price_amount) : null,
    price_period_code: price_period_code || "monthly",
    estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
    opty_request_date: opty_request_date || null,
    approval_date: approval_date || null,
    start_date: start_date || null,
    end_date: end_date || null,
    po_doc_url,
    sales_pic_name,
    notes,
    pipeline_stage_code,
    opty_status_code: opty_status_code || null,
  });

  const newFiles = extractFiles(formData, "attachments");
  const newLinks = extractLinks(formData, "attachments_links");
  if (newFiles.length > 0 || newLinks.length > 0) {
    await saveAttachmentsAndLinks(OPPORTUNITY_PO_DOC_SOURCE, id, { files: newFiles, links: newLinks }, sales_pic_name);
  }

  const newPqFiles = extractFiles(formData, "pq_attachments");
  const newPqLinks = extractLinks(formData, "pq_attachments_links");
  if (newPqFiles.length > 0 || newPqLinks.length > 0) {
    await saveAttachmentsAndLinks(PQ_DOCUMENT_SOURCE, id, { files: newPqFiles, links: newPqLinks }, sales_pic_name);
  }

  await logActivity("sales", "create", `PQ Tracker: ${client_name} — ${project_name}`, "PQ Tracker");
  revalidatePath("/sales");
}

/**
 * Flow baru: Sales bikin deal perpanjangan buat talent yang SUDAH ada
 * (bukan hire baru), dari halaman Opportunity Tracker -- mengikuti pola
 * "Convert to Requisition" yang SUDAH ADA (1 opty_no dipakai bareng dari hulu
 * ke hilir, biar bisa ditrack). TIDAK lewat Talent Acquisition sama sekali
 * (nggak ada requisition/onboarding baru). Satu submit langsung bikin 3 hal
 * sekaligus dalam 1 transaksi:
 * 1. Row baru di Opportunity Tracker (salesOpportunityTrackers) -- supaya
 *    kelihatan juga di list Opportunity Tracker seperti tracker lain, sudah
 *    ditandai qualified & win (bukan lead yang masih perlu di-follow-up).
 * 2. Row baru di PQ Tracker (opportunities), ke-link ke tracker di atas
 *    lewat opportunity_tracker_id -- pakai opty_no yang SAMA dengan tracker.
 * 3. Row PENDING di TM Extension Request, ke-link ke PQ Tracker barusan --
 *    TM tinggal lengkapi rincian gaji & approval chain-nya (proposed_* masih
 *    kosong, requester_user_id/approver belum di-set) lewat Edit di sana,
 *    persis kayak pola notifikasi "talent baru" di HR.
 */
export async function createExtensionRequestFromSales(formData: FormData): Promise<void> {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  const employee_id = formData.get("employee_id") as string;
  if (!employee_id) throw new Error("Talent yang mau di-extend wajib dipilih.");

  const client_name = formData.get("client_name") as string;
  const client_type_code = formData.get("client_type_code") as string;
  const project_name = formData.get("project_name") as string;
  const position_name = formData.get("position_name") as string;
  const service_type_code = formData.get("service_type_code") as string;
  const business_unit_code = formData.get("business_unit_code") as string;
  const level_code = formData.get("level_code") as string;
  const headcount_target = formData.get("headcount_target") as string;
  const priority_code = formData.get("priority_code") as string;
  const price_amount = formData.get("price_amount") as string;
  const price_period_code = formData.get("price_period_code") as string;
  const estimated_duration_months = formData.get("estimated_duration_months") as string;
  const start_date = formData.get("start_date") as string;
  const end_date = formData.get("end_date") as string;
  const sales_pic_name = formData.get("sales_pic_name") as string;
  const notes = formData.get("notes") as string;

  const opty_no = await generateOptyNo();
  const id = randomUUID();

  await db.transaction(async (tx) => {
    const [tracker] = await tx.insert(salesOpportunityTrackers).values({
      opty_no,
      client_name,
      client_type_code: client_type_code || null,
      service_type_code: service_type_code || null,
      requirement_summary: project_name,
      sales_pic_name,
      position_name: position_name || null,
      level_code: level_code || null,
      headcount_target: headcount_target ? Number(headcount_target) : null,
      price_amount: price_amount ? Number(price_amount) : null,
      price_period_code: price_period_code || "monthly",
      estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
      // Ini deal perpanjangan yang sudah pasti (bukan lead baru yang masih
      // perlu di-follow-up/kualifikasi) -- langsung ditandai qualified & win.
      sales_qualified: true,
      opty_status_code: "win",
      progress_notes: notes || null,
    }).returning();

    await tx.insert(opportunities).values({
      id,
      opty_no,
      pq_no: await generatePqNo(client_name, position_name, business_unit_code),
      client_name,
      client_type_code: client_type_code || null,
      project_name,
      position_name: position_name || null,
      service_type_code,
      business_unit_code: business_unit_code || null,
      level_code: level_code || null,
      headcount_target: headcount_target ? Number(headcount_target) : null,
      priority_code: priority_code || null,
      price_amount: price_amount ? Number(price_amount) : null,
      price_period_code: price_period_code || "monthly",
      estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
      start_date: start_date || null,
      end_date: end_date || null,
      sales_pic_name,
      notes,
      pipeline_stage_code: "win",
      opportunity_tracker_id: tracker.id,
    });

    await tx.insert(extensionIncrementRequests).values({
      employee_id,
      pq_tracker_id: id,
      propose_start_date: start_date || null,
      propose_end_date: end_date || null,
      proposed_position_name: position_name || null,
      requester_name: sales_pic_name || "Sales",
      notes: notes || null,
    });
  });

  const [employee] = await db.select({ employee_no: employees.employee_no }).from(employees).where(eq(employees.id, employee_id));
  await notifyDivision(
    "tm",
    "Extension Request Baru dari Sales",
    `${sales_pic_name} mengajukan perpanjangan untuk ${employee?.employee_no ?? "talent"} — ${client_name} (${position_name || "-"}). Lengkapi rincian gaji & approval chain di TM Extension Request.`,
    "/tm/extension-requests"
  );

  await logActivity("sales", "create", `Extension Request: ${client_name} — ${position_name}`, "Opportunity Tracker");
  revalidatePath("/sales/opportunity-tracker");
  revalidatePath("/sales");
  revalidatePath("/tm/extension-requests");
}

export async function updateOpportunity(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  const client_name = formData.get("client_name") as string;
  const client_type_code = formData.get("client_type_code") as string;
  const project_name = formData.get("project_name") as string;
  const position_name = formData.get("position_name") as string;
  const service_type_code = formData.get("service_type_code") as string;
  const business_unit_code = formData.get("business_unit_code") as string;
  const level_code = formData.get("level_code") as string;
  const headcount_target = formData.get("headcount_target") as string;
  const priority_code = formData.get("priority_code") as string;
  const bant_score = formData.get("bant_score") as string;
  const price_amount = formData.get("price_amount") as string;
  const price_period_code = formData.get("price_period_code") as string;
  const estimated_duration_months = formData.get("estimated_duration_months") as string;
  const opty_request_date = formData.get("opty_request_date") as string;
  const approval_date = formData.get("approval_date") as string;
  const start_date = formData.get("start_date") as string;
  const end_date = formData.get("end_date") as string;
  const po_doc_url_text = formData.get("po_doc_url") as string;
  const po_doc_file = formData.get("po_doc_file") as File | null;
  const sales_pic_name = formData.get("sales_pic_name") as string;
  const notes = formData.get("notes") as string;
  const pipeline_stage_code = formData.get("pipeline_stage_code") as string;
  const opty_status_code = formData.get("opty_status_code") as string;
  const pq_no = formData.get("pq_no") as string;

  // No/Status PKS, PO, CR, Other Doc -- field yang SAMA dengan Document Tracker
  // PMO (satu baris project_documents per opportunity), jadi begitu Sales edit
  // di sini langsung sync ke PMO dan sebaliknya (bukan salinan/duplikat data).
  const pks_no = formData.get("pks_no") as string;
  const pks_status_code = formData.get("pks_status_code") as string;
  const po_no = formData.get("po_no") as string;
  const po_status_code = formData.get("po_status_code") as string;
  const cr_no = formData.get("cr_no") as string;
  const cr_status_code = formData.get("cr_status_code") as string;
  const other_doc_no = formData.get("other_doc_no") as string;
  const other_doc_status_code = formData.get("other_doc_status_code") as string;
  const project_details = formData.get("project_details") as string;
  const sales_type_code = formData.get("sales_type_code") as string;

  let po_doc_url: string | undefined = undefined;
  if (po_doc_file && po_doc_file.size > 0) {
    po_doc_url = await uploadDocument(po_doc_file, id, "po_doc");
  } else if (po_doc_url_text) {
    po_doc_url = po_doc_url_text;
  }

  const [beforePipeline] = await db.select({ pipeline_stage_code: opportunities.pipeline_stage_code }).from(opportunities).where(eq(opportunities.id, id));

  await db.update(opportunities).set({
    client_name,
    client_type_code: client_type_code || null,
    project_name,
    position_name: position_name || null,
    service_type_code,
    business_unit_code: business_unit_code || null,
    level_code: level_code || null,
    headcount_target: headcount_target ? Number(headcount_target) : null,
    priority_code: priority_code || null,
    bant_score: bant_score ? Number(bant_score) : null,
    price_amount: price_amount ? Number(price_amount) : null,
    price_period_code: price_period_code || "monthly",
    estimated_duration_months: estimated_duration_months ? Number(estimated_duration_months) : null,
    opty_request_date: opty_request_date || null,
    approval_date: approval_date || null,
    start_date: start_date || null,
    end_date: end_date || null,
    ...(po_doc_url !== undefined ? { po_doc_url } : {}),
    sales_pic_name,
    notes,
    ...(pipeline_stage_code ? { pipeline_stage_code } : {}),
    // Form Edit PQ Tracker ini nggak punya input opty_status_code (itu di-set
    // lewat quick-select StageSelector di list) -- kalau ditulis unconditional,
    // tiap kali form ini di-save (mis. upload file PQ) statusnya ke-reset ke
    // NULL, kayak "Project Won" balik lagi ke belum dipilih. Guard-nya sama
    // kayak pipeline_stage_code di atas.
    ...(opty_status_code ? { opty_status_code } : {}),
    pq_no: pq_no || null,
  }).where(eq(opportunities.id, id));

  // Sama seperti updatePipelineStage -- begitu opportunity ditandai Won lewat
  // form edit ini (bukan cuma quick-select di tabel), PMO & TM tetap harus
  // dikasih tau (lihat getPendingContractSetups jalur "won_direct").
  if (pipeline_stage_code === "win" && beforePipeline && beforePipeline.pipeline_stage_code !== "win") {
    await notifyDivision(
      "tm",
      "Opportunity Won -- Perlu Talent Assignment",
      `${client_name} (${pq_no || id}) sudah Won di Sales. Silakan proses talent assignment kalau belum ada.`,
      "/tm"
    );
    revalidatePath("/pmo/contracts");
  }

  const [existingDoc] = await db.select({ id: projectDocuments.id }).from(projectDocuments).where(eq(projectDocuments.opportunity_id, id)).limit(1);
  const docFields = {
    pks_no: pks_no || null,
    pks_status_code: pks_status_code || null,
    po_no: po_no || null,
    po_status_code: po_status_code || null,
    cr_no: cr_no || null,
    cr_status_code: cr_status_code || null,
    other_doc_no: other_doc_no || null,
    other_doc_status_code: other_doc_status_code || null,
    project_details: project_details || null,
    sales_type_code: sales_type_code || null,
  };
  if (existingDoc) {
    await db.update(projectDocuments).set(docFields).where(eq(projectDocuments.id, existingDoc.id));
  } else if (Object.values(docFields).some((v) => v !== null)) {
    // Baru insert row project_documents kalau ada isinya -- kalau semua kosong,
    // nggak perlu bikin row PMO yang bakal muncul kosong di Document Tracker.
    await db.insert(projectDocuments).values({ opportunity_id: id, ...docFields });
  }

  const newFiles = extractFiles(formData, "attachments");
  const newLinks = extractLinks(formData, "attachments_links");
  if (newFiles.length > 0 || newLinks.length > 0) {
    await saveAttachmentsAndLinks(OPPORTUNITY_PO_DOC_SOURCE, id, { files: newFiles, links: newLinks }, sales_pic_name);
  }

  const newPqFiles = extractFiles(formData, "pq_attachments");
  const newPqLinks = extractLinks(formData, "pq_attachments_links");
  if (newPqFiles.length > 0 || newPqLinks.length > 0) {
    await saveAttachmentsAndLinks(PQ_DOCUMENT_SOURCE, id, { files: newPqFiles, links: newPqLinks }, sales_pic_name);
  }

  await logActivity("sales", "update", `PQ Tracker: ${client_name} — ${project_name}`, "PQ Tracker");
  revalidatePath("/sales");
  await markSaved();
  redirect("/sales");
}

export type UpdateStageResult = { ok: true } | { ok: false; error: string };

export async function updatePipelineStage(id: string, pipeline_stage_code: string): Promise<UpdateStageResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("sales");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  const [before] = await db.select({ client_name: opportunities.client_name, opty_no: opportunities.opty_no, pipeline_stage_code: opportunities.pipeline_stage_code }).from(opportunities).where(eq(opportunities.id, id));

  await db.update(opportunities).set({ pipeline_stage_code }).where(eq(opportunities.id, id));
  await logActivity("sales", "update", `Pipeline Stage diubah jadi ${pipeline_stage_code}`, "PQ Tracker");

  // Begitu opportunity ditandai Won, PMO langsung bisa proses A.Contract
  // (lihat getPendingContractSetups jalur "won_direct") TANPA nunggu proses
  // TM (onboarding/talent assignment) selesai duluan. TM tetap dikasih tau di
  // sini secara paralel supaya mereka juga jalan proses talent assignment-nya.
  if (pipeline_stage_code === "win" && before && before.pipeline_stage_code !== "win") {
    await notifyDivision(
      "tm",
      "Opportunity Won -- Perlu Talent Assignment",
      `${before.client_name} (${before.opty_no}) sudah Won di Sales. Silakan proses talent assignment kalau belum ada.`,
      "/tm"
    );
  }

  revalidatePath("/sales");
  revalidatePath("/pmo/contracts");
  return { ok: true };
}

export async function updateOptyStatus(id: string, opty_status_code: string): Promise<UpdateStageResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("sales");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.update(opportunities).set({ opty_status_code }).where(eq(opportunities.id, id));
  await logActivity("sales", "update", `Opty Status diubah jadi ${opty_status_code}`, "PQ Tracker");
  revalidatePath("/sales");
  return { ok: true };
}

export async function deleteOpportunityAttachment(attachmentId: string) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  await deleteAttachment(attachmentId);
  await logActivity("sales", "delete", "Lampiran PO/Dokumen dihapus", "PQ Tracker");
  revalidatePath("/sales");
}

export type SendPqResult = { ok: true } | { ok: false; error: string };

/** Kirim dokumen PQ opportunity ini ke TTD Online untuk ditandatangani (1 signer). */
export async function sendPqForSignature(opportunityId: string, formData: FormData): Promise<SendPqResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("sales");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const session = await getServerSession(authOptions);
  const requesterId = (session?.user as any)?.id as string | undefined;
  const requesterName = (session?.user as any)?.fullName ?? session?.user?.name ?? "Seseorang";
  if (!requesterId) return { ok: false, error: "Belum login" };

  const signer_user_id = formData.get("signer_user_id") as string;
  if (!signer_user_id) return { ok: false, error: "Signer wajib dipilih" };

  const existing = await db.select().from(signatureRequests).where(and(
    eq(signatureRequests.source_type, PQ_SIGNATURE_SOURCE),
    eq(signatureRequests.source_id, opportunityId)
  ));
  if (existing.some((r) => r.status_code === "pending" || r.status_code === "signed")) {
    return { ok: false, error: "PQ ini sudah pernah dikirim untuk TTD" };
  }

  const [opty] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
  if (!opty) return { ok: false, error: "Opportunity tidak ditemukan" };

  const newFiles = extractFiles(formData, "pq_attachments");
  const newLinks = extractLinks(formData, "pq_attachments_links");
  if (newFiles.length > 0 || newLinks.length > 0) {
    await saveAttachmentsAndLinks(PQ_DOCUMENT_SOURCE, opportunityId, { files: newFiles, links: newLinks }, opty.sales_pic_name);
  }

  const existingDocs = await getAttachmentsWithUrls(PQ_DOCUMENT_SOURCE, opportunityId);
  if (existingDocs.length === 0) {
    return { ok: false, error: "Upload dokumen PQ dulu sebelum kirim ke TTD" };
  }

  await db.insert(signatureRequests).values({
    document_title: `PQ - ${opty.opty_no}`,
    requested_by_user_id: requesterId,
    signer_user_id,
    source_type: PQ_SIGNATURE_SOURCE,
    source_id: opportunityId,
    step_code: PQ_SIGNATURE_STEP,
    step_order: 0,
  });

  await createNotification(
    signer_user_id,
    "Permintaan Tanda Tangan PQ",
    `${requesterName} meminta Anda menandatangani PQ "${opty.opty_no}" (${opty.client_name}).`,
    "/ttd-online"
  );

  await logActivity("sales", "create", `PQ dikirim untuk TTD: ${opty.opty_no}`, "PQ Tracker");
  revalidatePath("/sales");
  return { ok: true };
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteOpportunity(id: string): Promise<DeleteResult> {
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
  const [opty] = await db.select().from(opportunities).where(eq(opportunities.id, id));
  await db.delete(opportunities).where(eq(opportunities.id, id));
  await logActivity("sales", "delete", `PQ Tracker: ${opty?.client_name ?? id}`, "PQ Tracker");
  revalidatePath("/sales");
  return { ok: true };
}

export async function generatePqNumber(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  const pq_no = formData.get("pq_no") as string;
  const client_name = formData.get("client_name") as string;
  const project_name = formData.get("project_name") as string;
  const client_type_code = formData.get("client_type_code") as string;
  const price_amount = formData.get("price_amount") as string;
  const price_period_code = formData.get("price_period_code") as string;
  const notes = formData.get("notes") as string;

  await db.update(opportunities).set({
    pq_no,
    client_name,
    project_name,
    client_type_code: client_type_code || null,
    price_amount: price_amount ? Number(price_amount) : null,
    price_period_code: price_period_code || undefined,
    notes: notes || null,
  }).where(eq(opportunities.id, id));

  revalidatePath("/sales");
}