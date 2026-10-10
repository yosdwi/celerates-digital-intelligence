"use server";
import { requireActor } from "@/lib/actor";
import { db } from "@/db";
import { overtimeBusinessTripClaims, opportunities, employees, candidates, onboardingRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { logActivity } from "@/lib/activity-log";
import { notifyDivision } from "@/lib/notifications";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { BILLING_STATUSES, TALENT_PAYMENT_STATUSES } from "./constants";
import { fieldDiffs, recordChanges } from "@/lib/field-history";

const BASE_PATH = "/pmo/overtime-business-trip";
/** V2 (Sales V2 workspace); the menu opens it, so notifications link there. */
const V2_PATH = "/sales/v2/overtime-business-trip";

function revalidate() {
  revalidatePath(BASE_PATH);
  revalidatePath(V2_PATH);
}

/** Update one claim and record each field that changed (the V2 panel's history), whichever page made the change. */
async function updateTracked(id: string, before: Record<string, unknown>, changes: Record<string, unknown>) {
  await db.update(overtimeBusinessTripClaims).set({ ...changes, updated_at: new Date() }).where(eq(overtimeBusinessTripClaims.id, id));
  await recordChanges("ot_claim", id, fieldDiffs(before, changes));
}

async function generateClaimNo(): Promise<string> {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (let i = 0; i < 5; i++) {
    const seq = String(Math.floor(1 + Math.random() * 9999)).padStart(4, "0");
    const candidate = `OT-${ymd}-${seq}`;
    const existing = await db.select().from(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.claim_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `OT-${ymd}-${Date.now()}`;
}

async function talentLabelOf(claim: { employee_id: string | null }): Promise<string> {
  if (!claim.employee_id) return "Talent";
  const [row] = await db.select({ candidate_name: candidates.candidate_name })
    .from(employees)
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .where(eq(employees.id, claim.employee_id));
  return row?.candidate_name ?? "Talent";
}

export async function createClaim(formData: FormData): Promise<void> {
  await requireActor();

  const access = await requireDivisionAccess("pmo");

  const claim_type_code = formData.get("claim_type_code") as string;
  const claim_title = formData.get("claim_title") as string;
  if (!claim_type_code || !claim_title) throw new Error("Tipe klaim dan judul wajib diisi");

  const get = (name: string) => (formData.get(name) as string) || null;
  const getNum = (name: string) => { const v = formData.get(name) as string; return v ? Number(v) : null; };

  const claim_no = await generateClaimNo();

  await db.insert(overtimeBusinessTripClaims).values({
    claim_no,
    opportunity_id: get("opportunity_id"),
    employee_id: get("employee_id"),
    claim_type_code,
    claim_title,
    days_count: getNum("days_count"),
    start_date: get("start_date"),
    end_date: get("end_date"),
    duration_hours_client: getNum("duration_hours_client"),
    duration_hours_pmo_basic: getNum("duration_hours_pmo_basic"),
    duration_hours_payroll: getNum("duration_hours_payroll"),
    spk_url: get("spk_url"),
    timesheet_url: get("timesheet_url"),
    draft_timesheet_url: get("draft_timesheet_url"),
    pq_submit_date: get("pq_submit_date"),
    pq_status_code: get("pq_status_code") ?? "not_started",
    po_status_code: get("po_status_code") ?? "not_started",
    cr_status_code: get("cr_status_code") ?? "not_started",
    pic_1_name: get("pic_1_name") ?? access.userName,
    amount_given_to_talent_initial: getNum("amount_given_to_talent_initial"),
    given_to_talent_initial_date: get("given_to_talent_initial_date"),
    amount_claim_to_client_total: getNum("amount_claim_to_client_total"),
    amount_bt_medical_to_client: getNum("amount_bt_medical_to_client"),
    amount_uang_saku_celerates: getNum("amount_uang_saku_celerates"),
    amount_transport: getNum("amount_transport"),
    amount_over_bagasi: getNum("amount_over_bagasi"),
    amount_etc: getNum("amount_etc"),
    notes: get("notes"),
    created_by_name: access.userName,
  });

  await logActivity("pmo", "create", `Klaim ${claim_type_code}: ${claim_title} (${claim_no})`, "Overtime & Business Trip");
  revalidate();
}

/** Every field the PMO form edits, read from the form (V1's full form and V2's cell edits post the same fields). */
function claimFields(formData: FormData) {
  const claim_type_code = formData.get("claim_type_code") as string;
  const claim_title = formData.get("claim_title") as string;
  if (!claim_type_code || !claim_title) throw new Error("Tipe klaim dan judul wajib diisi");

  const get = (name: string) => (formData.get(name) as string) || null;
  const getNum = (name: string) => { const v = formData.get(name) as string; return v ? Number(v) : null; };

  return {
    opportunity_id: get("opportunity_id"),
    employee_id: get("employee_id"),
    claim_type_code,
    claim_title,
    days_count: getNum("days_count"),
    start_date: get("start_date"),
    end_date: get("end_date"),
    duration_hours_client: getNum("duration_hours_client"),
    duration_hours_pmo_basic: getNum("duration_hours_pmo_basic"),
    duration_hours_payroll: getNum("duration_hours_payroll"),
    spk_url: get("spk_url"),
    timesheet_url: get("timesheet_url"),
    draft_timesheet_url: get("draft_timesheet_url"),
    pq_submit_date: get("pq_submit_date"),
    pq_status_code: get("pq_status_code") ?? "not_started",
    po_status_code: get("po_status_code") ?? "not_started",
    cr_status_code: get("cr_status_code") ?? "not_started",
    pic_1_name: get("pic_1_name"),
    amount_given_to_talent_initial: getNum("amount_given_to_talent_initial"),
    amount_claim_to_client_total: getNum("amount_claim_to_client_total"),
    amount_bt_medical_to_client: getNum("amount_bt_medical_to_client"),
    amount_uang_saku_celerates: getNum("amount_uang_saku_celerates"),
    amount_transport: getNum("amount_transport"),
    amount_over_bagasi: getNum("amount_over_bagasi"),
    amount_etc: getNum("amount_etc"),
    notes: get("notes"),
  };
}

async function saveClaim(id: string, formData: FormData) {
  await requireDivisionAccess("pmo");
  const changes = claimFields(formData);
  const [before] = await db.select().from(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.id, id));
  if (!before) throw new Error("Klaim tidak ditemukan");
  await updateTracked(id, before, changes);
  await logActivity("pmo", "update", `Klaim diperbarui: ${id}`, "Overtime & Business Trip");
  revalidate();
}

/**
 * PMO edit klaim yang sudah ada -- biasanya karena ada koreksi perhitungan
 * durasi jam lembur/business trip setelah data awal diinput.
 */
export async function updateClaim(id: string, formData: FormData): Promise<void> {
  await requireActor();
  await saveClaim(id, formData);
  await markSaved();
  redirect(BASE_PATH);
}

/** V2's cell and panel edits: the same write as updateClaim, without leaving the page. */
export async function updateClaimFields(id: string, formData: FormData): Promise<ClaimActionResult> {
  await requireActor();
  try { await saveClaim(id, formData); } catch (e: any) { return { ok: false, error: e.message }; }
  return { ok: true };
}

export type ClaimActionResult = { ok: true } | { ok: false; error: string };

/** PMO forward klaim ke Sales untuk konfirmasi ke client. */
export async function forwardToSales(id: string): Promise<ClaimActionResult> {
  await requireActor();

  let actor;
  try { actor = await requireDivisionAccess("pmo"); } catch (e: any) { return { ok: false, error: e.message }; }

  const [claim] = await db.select().from(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.id, id));
  if (!claim) return { ok: false, error: "Klaim tidak ditemukan" };
  if (claim.status_code !== "draft") return { ok: false, error: "Klaim ini sudah diforward sebelumnya" };

  await updateTracked(id, claim, { status_code: "forwarded_to_sales" });

  const talentLabel = await talentLabelOf(claim);
  await notifyDivision("sales", "Klaim Overtime/Business Trip Perlu Dikonfirmasi", `${actor.userName} forward klaim "${claim.claim_title}" (${claim.claim_no}) untuk ${talentLabel} -- mohon konfirmasi ke client.`, V2_PATH);

  await logActivity("pmo", "update", `Klaim di-forward ke Sales: ${claim.claim_no}`, "Overtime & Business Trip");
  revalidate();
  return { ok: true };
}

/** Sales submit ke Finance setelah konfirmasi client. */
export async function submitToFinance(id: string): Promise<ClaimActionResult> {
  await requireActor();

  let actor;
  try { actor = await requireDivisionAccess("sales"); } catch (e: any) { return { ok: false, error: e.message }; }

  const [claim] = await db.select().from(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.id, id));
  if (!claim) return { ok: false, error: "Klaim tidak ditemukan" };
  if (claim.status_code !== "forwarded_to_sales") return { ok: false, error: "Klaim ini belum di-forward PMO atau sudah lanjut ke Finance" };

  await updateTracked(id, claim, { status_code: "submitted_to_finance" });

  const talentLabel = await talentLabelOf(claim);
  await notifyDivision("finance", "Klaim Perlu Diinvoice", `${actor.userName} submit klaim "${claim.claim_title}" (${claim.claim_no}) untuk ${talentLabel} -- siap diinvoice ke client.`, V2_PATH);

  await logActivity("sales", "update", `Klaim disubmit ke Finance: ${claim.claim_no}`, "Overtime & Business Trip");
  revalidate();
  return { ok: true };
}

/** Finance tandai sudah diinvoice ke client. */
export async function markInvoiced(id: string, formData: FormData): Promise<ClaimActionResult> {
  await requireActor();

  let actor;
  try { actor = await requireDivisionAccess("finance"); } catch (e: any) { return { ok: false, error: e.message }; }

  const invoice_no = (formData.get("invoice_no") as string) || null;
  const amountRaw = formData.get("amount_total_billed_to_client") as string;
  if (!invoice_no) return { ok: false, error: "Nomor invoice wajib diisi" };

  const [claim] = await db.select().from(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.id, id));
  if (!claim) return { ok: false, error: "Klaim tidak ditemukan" };
  if (claim.status_code !== "submitted_to_finance") return { ok: false, error: "Klaim ini belum disubmit Sales ke Finance" };

  await updateTracked(id, claim, {
    status_code: "invoiced",
    billing_status_code: "done",
    invoice_no,
    amount_total_billed_to_client: amountRaw ? Number(amountRaw) : claim.amount_total_billed_to_client,
  });

  const talentLabel = await talentLabelOf(claim);
  await notifyDivision("pmo", "Klaim Selesai Diinvoice", `${actor.userName} menandai klaim "${claim.claim_title}" (${claim.claim_no}) untuk ${talentLabel} sudah diinvoice (${invoice_no}).`, V2_PATH);

  await logActivity("finance", "update", `Klaim diinvoice: ${claim.claim_no} (${invoice_no})`, "Overtime & Business Trip");
  revalidate();
  return { ok: true };
}

export async function updateBillingStatus(id: string, statusCode: string): Promise<ClaimActionResult> {
  await requireActor();

  try { await requireDivisionAccess("finance"); } catch (e: any) { return { ok: false, error: e.message }; }
  if (!BILLING_STATUSES.some(([v]) => v === statusCode)) return { ok: false, error: "Status penagihan tidak dikenal" };
  const [claim] = await db.select().from(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.id, id));
  if (!claim) return { ok: false, error: "Klaim tidak ditemukan" };
  await updateTracked(id, claim, { billing_status_code: statusCode });
  await logActivity("finance", "update", `Status penagihan diubah jadi ${statusCode}`, "Overtime & Business Trip");
  revalidate();
  return { ok: true };
}

/** HR proses pencairan ke talent. */
export async function updateTalentPayment(id: string, formData: FormData): Promise<ClaimActionResult> {
  await requireActor();

  let actor;
  try { actor = await requireDivisionAccess("hr"); } catch (e: any) { return { ok: false, error: e.message }; }

  const talent_payment_status_code = formData.get("talent_payment_status_code") as string;
  const amountRaw = formData.get("amount_total_given_to_talent") as string;
  const talent_payment_date = (formData.get("talent_payment_date") as string) || null;
  if (!TALENT_PAYMENT_STATUSES.some(([v]) => v === talent_payment_status_code)) return { ok: false, error: "Status pencairan tidak dikenal" };

  const [claim] = await db.select().from(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.id, id));
  if (!claim) return { ok: false, error: "Klaim tidak ditemukan" };

  await updateTracked(id, claim, {
    talent_payment_status_code,
    amount_total_given_to_talent: amountRaw ? Number(amountRaw) : claim.amount_total_given_to_talent,
    talent_payment_date,
    pic_2_name: actor.userName,
  });

  if (talent_payment_status_code === "done") {
    const talentLabel = await talentLabelOf(claim);
    await notifyDivision("pmo", "Pencairan Talent Selesai", `${actor.userName} menandai pencairan klaim "${claim.claim_title}" (${claim.claim_no}) untuk ${talentLabel} sudah selesai diberikan.`, V2_PATH);
  }

  await logActivity("hr", "update", `Status pencairan talent diubah jadi ${talent_payment_status_code}: ${claim.claim_no}`, "Overtime & Business Trip");
  revalidate();
  return { ok: true };
}

export async function deleteClaim(id: string): Promise<ClaimActionResult> {
  await requireActor();

  try { await requireDivisionAccess("pmo", "full"); } catch (e: any) { return { ok: false, error: e.message }; }

  const [claim] = await db.select().from(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.id, id));
  if (!claim) return { ok: false, error: "Klaim tidak ditemukan" };

  await db.delete(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.id, id));
  await logActivity("pmo", "delete", `Klaim dihapus: ${claim.claim_no}`, "Overtime & Business Trip");
  revalidate();
  return { ok: true };
}
