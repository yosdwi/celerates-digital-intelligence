"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { projectDocuments, projectContracts, projectInvoices, projectMonthlyBillings, financeDocumentHandoffs, opportunities } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { uploadDocument } from "@/lib/storage";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { saveAttachmentsAndLinks, extractFiles, extractLinks, deleteAttachment } from "@/lib/attachments";
import { notifyDivision } from "@/lib/notifications";
import { PROJECT_DOC_SOURCES, INVOICE_BAST_DOC_SOURCE } from "./constants";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { formatMonthNameYear } from "@/lib/month-format";

// ---------- Invoice: auto-overdue ----------

/**
 * Invoice yang belum Submitted (masih Planned/kosong) dan udah lewat 2 minggu
 * dari akhir bulan Services Month-nya otomatis ditandai Overdue. Dipanggil
 * tiap kali halaman TM Invoice dibuka -- bukan cron, tapi cukup buat data
 * yang selalu ke-refresh saat dilihat.
 */
export async function syncOverdueInvoices() {
  await requirePilotActor();

  await db.execute(sql`
    UPDATE project_invoices
    SET status_code = 'overdue'
    WHERE (status_code IS NULL OR status_code = 'planned')
      AND services_month_start IS NOT NULL
      AND (date_trunc('month', services_month_start::date) + interval '1 month' + interval '14 days') < now()
  `);
}

/**
 * Setiap bulan di Billing Schedule (dari A.Contract) yang belum punya baris
 * TM Invoice otomatis dibuatkan satu (status Planned), jadi PMO nggak perlu
 * input manual tiap bulan lagi -- tinggal update status/BAST-nya.
 * Dipanggil tiap kali halaman TM Invoice dibuka, sama seperti syncOverdueInvoices.
 */
export async function syncBillingScheduleToInvoices() {
  await requirePilotActor();

  await db.execute(sql`
    INSERT INTO project_invoices (opportunity_id, services_month_start, price_per_month, status_code, invoice_plan_date)
    SELECT pc.opportunity_id, pmb.month, pmb.amount, 'planned', pmb.month
    FROM project_monthly_billings pmb
    JOIN project_contracts pc ON pc.id = pmb.contract_id
    WHERE NOT EXISTS (
      SELECT 1 FROM project_invoices pi
      WHERE pi.opportunity_id = pc.opportunity_id
        AND pi.services_month_start = pmb.month
    )
  `);
}

/**
 * Setiap Opportunity yang sudah punya A.Contract tapi belum punya baris
 * Document Tracker otomatis dibuatkan satu (kosong, tinggal diisi PKS/PO/CR),
 * supaya daftar Document Tracker & A.Contract selalu menampilkan project yang
 * sama persis -- nggak ada project yang "kelewat" nyantol cuma di satu sisi.
 * Dipanggil tiap kali halaman Document Tracker dibuka, sama seperti
 * syncBillingScheduleToInvoices di atas.
 */
export async function syncDocumentTrackerFromContracts() {
  await requirePilotActor();

  await db.execute(sql`
    INSERT INTO project_documents (opportunity_id, po_start_date, po_end_date, pq_price)
    SELECT DISTINCT pc.opportunity_id, o.start_date, o.end_date, o.price_amount
    FROM project_contracts pc
    JOIN opportunities o ON o.id = pc.opportunity_id
    WHERE NOT EXISTS (
      SELECT 1 FROM project_documents pd
      WHERE pd.opportunity_id = pc.opportunity_id
    )
  `);
}

async function clientNameOf(opportunityId: string): Promise<string> {
  const [opty] = await db.select({ client_name: opportunities.client_name }).from(opportunities).where(eq(opportunities.id, opportunityId));
  return opty?.client_name ?? opportunityId;
}

// ---------- Document Tracker ----------

export async function createProjectDocument(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("pmo");
  const opportunity_id = formData.get("opportunity_id") as string;
  if (!opportunity_id) throw new Error("Opportunity wajib dipilih");

  const id = randomUUID();
  const get = (name: string) => (formData.get(name) as string) || null;
  const getNum = (name: string) => { const v = formData.get(name) as string; return v ? Number(v) : null; };

  async function resolveUrl(urlName: string, fileName: string, docType: string): Promise<string | null> {
    const file = formData.get(fileName) as File | null;
    if (file && file.size > 0) return await uploadDocument(file, id, docType);
    return get(urlName);
  }

  const pks_url = await resolveUrl("pks_url", "pks_file", "pks");
  const po_url = await resolveUrl("po_url", "po_file", "po");
  const cr_url = await resolveUrl("cr_url", "cr_file", "cr");
  const other_doc_url = await resolveUrl("other_doc_url", "other_doc_file", "other_doc");
  const sales_type_code = get("sales_type_code");

  await db.insert(projectDocuments).values({
    id,
    opportunity_id,
    project_details: get("project_details"),
    pq_price: getNum("pq_price"),
    pq_total: getNum("pq_total"),
    pks_no: get("pks_no"),
    pks_url,
    pks_status_code: get("pks_status_code"),
    po_start_date: get("po_start_date"),
    po_end_date: get("po_end_date"),
    po_no: get("po_no"),
    po_url,
    po_status_code: get("po_status_code"),
    cr_no: get("cr_no"),
    cr_url,
    cr_status_code: get("cr_status_code"),
    other_doc_no: get("other_doc_no"),
    other_doc_url,
    other_doc_status_code: get("other_doc_status_code"),
    sales_type_code,
  });

  await saveProjectDocAttachments(id, formData);

  await logActivity("pmo", "create", `Document Tracker: ${await clientNameOf(opportunity_id)}`, "Talent Document Tracker");
  revalidatePath("/pmo");
}

async function saveProjectDocAttachments(projectDocumentId: string, formData: FormData) {
  for (const [slot, sourceType] of Object.entries(PROJECT_DOC_SOURCES)) {
    const files = extractFiles(formData, `${slot}_attachments`);
    const links = extractLinks(formData, `${slot}_attachments_links`);
    if (files.length > 0 || links.length > 0) {
      await saveAttachmentsAndLinks(sourceType, projectDocumentId, { files, links });
    }
  }
}

export async function deleteProjectDocAttachment(attachmentId: string) {
  await requirePilotActor();

  await requireDivisionAccess("pmo");
  await deleteAttachment(attachmentId);
  await logActivity("pmo", "delete", "Lampiran Document Tracker dihapus", "Talent Document Tracker");
  revalidatePath("/pmo");
}

export async function updateProjectDocument(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("pmo");
  const get = (name: string) => (formData.get(name) as string) || null;
  const getNum = (name: string) => { const v = formData.get(name) as string; return v ? Number(v) : null; };

  async function resolveUrl(urlName: string, fileName: string, docType: string): Promise<string | undefined> {
    const file = formData.get(fileName) as File | null;
    if (file && file.size > 0) return await uploadDocument(file, id, docType);
    const text = get(urlName);
    return text ?? undefined;
  }

  const pks_url = await resolveUrl("pks_url", "pks_file", "pks");
  const po_url = await resolveUrl("po_url", "po_file", "po");
  const cr_url = await resolveUrl("cr_url", "cr_file", "cr");
  const other_doc_url = await resolveUrl("other_doc_url", "other_doc_file", "other_doc");
  const sales_type_code = get("sales_type_code");

  await db.update(projectDocuments).set({
    opportunity_id: (formData.get("opportunity_id") as string) || undefined,
    project_details: get("project_details"),
    pq_price: getNum("pq_price"),
    pq_total: getNum("pq_total"),
    pks_no: get("pks_no"),
    ...(pks_url !== undefined ? { pks_url } : {}),
    pks_status_code: get("pks_status_code"),
    po_start_date: get("po_start_date"),
    po_end_date: get("po_end_date"),
    po_no: get("po_no"),
    ...(po_url !== undefined ? { po_url } : {}),
    po_status_code: get("po_status_code"),
    cr_no: get("cr_no"),
    ...(cr_url !== undefined ? { cr_url } : {}),
    cr_status_code: get("cr_status_code"),
    other_doc_no: get("other_doc_no"),
    ...(other_doc_url !== undefined ? { other_doc_url } : {}),
    other_doc_status_code: get("other_doc_status_code"),
    sales_type_code,
  }).where(eq(projectDocuments.id, id));

  await saveProjectDocAttachments(id, formData);

  await logActivity("pmo", "update", "Document Tracker diperbarui", "Talent Document Tracker");
  revalidatePath("/pmo");
  await markSaved();
  redirect("/pmo");
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteProjectDocument(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("pmo", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.delete(projectDocuments).where(eq(projectDocuments.id, id));
  await logActivity("pmo", "delete", "Document Tracker dihapus", "Talent Document Tracker");
  revalidatePath("/pmo");
  return { ok: true };
}

// ---------- Contract ----------

export async function createProjectContract(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("pmo");
  const opportunity_id = formData.get("opportunity_id") as string;
  if (!opportunity_id) throw new Error("Opportunity wajib dipilih");
  const sales_type_code = formData.get("sales_type_code") as string;

  const [newContract] = await db.insert(projectContracts).values({
    opportunity_id,
    monthly_value_amount: numOrNull(formData, "monthly_value_amount"),
    total_value_amount: numOrNull(formData, "total_value_amount"),
    contract_duration_months: numOrNull(formData, "contract_duration_months"),
    start_date: (formData.get("start_date") as string) || null,
    end_date: (formData.get("end_date") as string) || null,
    notes: formData.get("notes") as string,
    sales_type_code: sales_type_code || null,
  }).returning();

  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  const monthlyAmount = numOrNull(formData, "monthly_value_amount");
  if (startDate && endDate && monthlyAmount) {
    await generateMonthlyBillings(newContract.id, startDate, endDate, monthlyAmount);
  }

  await logActivity("pmo", "create", `A.Contract: ${await clientNameOf(opportunity_id)}`, "A.Contract");
  revalidatePath("/pmo/contracts");
}

export async function updateProjectContract(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("pmo");
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  const monthlyAmount = numOrNull(formData, "monthly_value_amount");
  const sales_type_code = formData.get("sales_type_code") as string;

  await db.update(projectContracts).set({
    monthly_value_amount: monthlyAmount,
    total_value_amount: numOrNull(formData, "total_value_amount"),
    contract_duration_months: numOrNull(formData, "contract_duration_months"),
    start_date: startDate || null,
    end_date: endDate || null,
    notes: formData.get("notes") as string,
    sales_type_code: sales_type_code || null,
  }).where(eq(projectContracts.id, id));

  if (startDate && endDate && monthlyAmount) {
    await generateMonthlyBillings(id, startDate, endDate, monthlyAmount);
  }

  await logActivity("pmo", "update", "A.Contract diperbarui", "A.Contract");
  revalidatePath("/pmo/contracts");
  await markSaved();
  redirect("/pmo/contracts");
}

export async function deleteProjectContract(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("pmo", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.delete(projectContracts).where(eq(projectContracts.id, id));
  await logActivity("pmo", "delete", "A.Contract dihapus", "A.Contract");
  revalidatePath("/pmo/contracts");
  return { ok: true };
}

// ---------- Invoice ----------

export async function createProjectInvoice(formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("pmo");
  const opportunity_id = formData.get("opportunity_id") as string;
  if (!opportunity_id) throw new Error("Opportunity wajib dipilih");

  const id = randomUUID();
  const bastFile = formData.get("bast_support_doc_file") as File | null;
  const bast_support_doc_url = bastFile && bastFile.size > 0
    ? await uploadDocument(bastFile, id, "bast_support")
    : (formData.get("bast_support_doc_url") as string) || null;

  // Group default-nya nama client (biar bisa dipakai kelompokkan/filter invoice
  // per client tanpa harus diketik ulang) -- tetap bisa diedit manual kalau perlu.
  const groupNameInput = formData.get("group_name") as string;
  const group_name = groupNameInput || await clientNameOf(opportunity_id);

  await db.insert(projectInvoices).values({
    id,
    opportunity_id,
    invoice_plan_date: (formData.get("invoice_plan_date") as string) || null,
    group_name,
    services_month_start: (formData.get("services_month_start") as string) || null,
    price_per_month: numOrNull(formData, "price_per_month"),
    status_code: (formData.get("status_code") as string) || null,
    bast_support_doc_url,
    notes: formData.get("notes") as string,
    issue_code: (formData.get("issue_code") as string) || null,
    submit_bast_date: (formData.get("submit_bast_date") as string) || null,
  });

  await saveInvoiceAttachments(id, formData);

  await logActivity("pmo", "create", `TM Invoice: ${await clientNameOf(opportunity_id)}`, "TM Invoice");
  revalidatePath("/pmo/invoices");
}

async function saveInvoiceAttachments(invoiceId: string, formData: FormData) {
  const files = extractFiles(formData, "bast_attachments");
  const links = extractLinks(formData, "bast_attachments_links");
  if (files.length > 0 || links.length > 0) {
    await saveAttachmentsAndLinks(INVOICE_BAST_DOC_SOURCE, invoiceId, { files, links });
  }
}

export async function deleteInvoiceAttachment(attachmentId: string, invoiceId?: string) {
  await requirePilotActor();

  await requireDivisionAccess("pmo");
  await deleteAttachment(attachmentId);
  await logActivity("pmo", "delete", "Lampiran TM Invoice dihapus", "TM Invoice");
  revalidatePath("/pmo/invoices");
  if (invoiceId) revalidatePath(`/pmo/invoices/${invoiceId}/edit`);
}

export async function updateProjectInvoice(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("pmo");
  const bastFile = formData.get("bast_support_doc_file") as File | null;
  const bast_support_doc_url = bastFile && bastFile.size > 0
    ? await uploadDocument(bastFile, id, "bast_support")
    : ((formData.get("bast_support_doc_url") as string) || undefined);

  // Group default-nya nama client kalau dikosongkan -- sama seperti createProjectInvoice.
  const groupNameInput = formData.get("group_name") as string;
  let group_name = groupNameInput || null;
  if (!group_name) {
    const [existing] = await db.select({ opportunity_id: projectInvoices.opportunity_id }).from(projectInvoices).where(eq(projectInvoices.id, id));
    if (existing) group_name = await clientNameOf(existing.opportunity_id);
  }

  await db.update(projectInvoices).set({
    invoice_plan_date: (formData.get("invoice_plan_date") as string) || null,
    group_name,
    services_month_start: (formData.get("services_month_start") as string) || null,
    price_per_month: numOrNull(formData, "price_per_month"),
    status_code: (formData.get("status_code") as string) || null,
    ...(bast_support_doc_url !== undefined ? { bast_support_doc_url } : {}),
    notes: formData.get("notes") as string,
    issue_code: (formData.get("issue_code") as string) || null,
    submit_bast_date: (formData.get("submit_bast_date") as string) || null,
  }).where(eq(projectInvoices.id, id));

  await saveInvoiceAttachments(id, formData);

  await logActivity("pmo", "update", "TM Invoice diperbarui", "TM Invoice");
  revalidatePath("/pmo/invoices");
  // Halaman edit-nya sendiri juga harus di-revalidate -- kalau nggak, Next.js
  // bisa nyajiin cache lama route ini pas dibuka lagi (BAST link/attachment
  // yang baru disimpan kelihatan "hilang" padahal di DB sudah benar).
  revalidatePath(`/pmo/invoices/${id}/edit`);
  await markSaved();
  redirect("/pmo/invoices");
}

export async function deleteProjectInvoice(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("pmo", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.delete(projectInvoices).where(eq(projectInvoices.id, id));
  await logActivity("pmo", "delete", "TM Invoice dihapus", "TM Invoice");
  revalidatePath("/pmo/invoices");
  return { ok: true };
}

// ---------- Finance Document Handoff ----------

export type FinanceHandoffResult = { ok: true } | { ok: false; error: string };

/**
 * Dipakai dari tombol "Kelengkapan Dokumen Finance" di TM Invoice. Satu
 * Opportunity = satu handoff record (link/dokumen gabungan buat semua
 * invoice project tsb, dan ini yang muncul sebagai 1 entry per project di
 * modul Finance), ditandai "notified" begitu PMO kasih tau Finance dokumennya
 * udah lengkap.
 *
 * Status invoice yang di-update jadi "submitted" HANYA baris invoice yang
 * tombol Notify-nya diklik (invoiceId) -- BUKAN semua invoice project ini.
 * Sebelumnya notify di 1 baris ikut nge-submit semua bulan lain di project
 * yang sama, padahal per bulan biasanya diserahkan ke Finance terpisah.
 */
export async function upsertFinanceHandoff(opportunityId: string, invoiceId: string, formData: FormData): Promise<FinanceHandoffResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("pmo");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const session = await getServerSession(authOptions);
  const notifierName = (session?.user as any)?.fullName ?? session?.user?.name ?? "Unknown";

  const doc_url = (formData.get("doc_url") as string) || null;
  const notes = (formData.get("notes") as string) || null;
  const notify = formData.get("notify") === "true";

  if (notify && !doc_url) {
    return { ok: false, error: "Isi link/dokumen dulu sebelum kasih tau Finance." };
  }

  const [existing] = await db.select().from(financeDocumentHandoffs).where(eq(financeDocumentHandoffs.opportunity_id, opportunityId));

  const values = {
    doc_url,
    notes,
    // Kalau cuma "Simpan Link" (notify=false), jangan turunkan status yang udah "received"/"needs_revision".
    // Notify ulang berarti submit dokumen baru -> reset ke "notified" dan bersihkan respons Finance sebelumnya.
    status_code: notify ? "notified" : existing?.status_code ?? "pending",
    notified_at: notify ? new Date() : existing?.notified_at ?? null,
    notified_by_name: notify ? notifierName : existing?.notified_by_name ?? null,
    received_at: notify ? null : existing?.received_at ?? null,
    received_by_name: notify ? null : existing?.received_by_name ?? null,
    finance_notes: notify ? null : existing?.finance_notes ?? null,
  };

  if (existing) {
    await db.update(financeDocumentHandoffs).set(values).where(eq(financeDocumentHandoffs.id, existing.id));
  } else {
    await db.insert(financeDocumentHandoffs).values({ opportunity_id: opportunityId, ...values });
  }

  if (notify) {
    // Cuma invoice baris ini yang jadi "submitted" -- bukan semua invoice
    // project (lihat catatan di atas fungsi ini).
    await db.update(projectInvoices).set({ status_code: "submitted" }).where(eq(projectInvoices.id, invoiceId));

    const [invoice] = await db.select({ services_month_start: projectInvoices.services_month_start }).from(projectInvoices).where(eq(projectInvoices.id, invoiceId));
    const monthLabel = invoice?.services_month_start ? formatMonthNameYear(invoice.services_month_start) : null;
    const clientLabel = await clientNameOf(opportunityId);
    await notifyDivision(
      "finance",
      "Dokumen Invoice Baru dari PMO",
      `${notifierName} menyerahkan dokumen invoice untuk ${clientLabel}${monthLabel ? ` (bulan ${monthLabel})` : ""}. Silakan cek dan verifikasi di menu Dokumen Finance.`,
      "/finance"
    );
  }

  const label = `Dokumen Finance: ${await clientNameOf(opportunityId)}${notify ? " (notified)" : ""}`;
  await logActivity("pmo", existing ? "update" : "create", label, "Dokumen Finance");
  revalidatePath("/pmo/invoices");
  revalidatePath("/finance");
  return { ok: true };
}

function numOrNull(formData: FormData, name: string): number | null {
  const v = formData.get(name) as string;
  return v ? Number(v) : null;
}

// Batas atas billing schedule -- mengikuti struktur sheet lama yang cuma
// punya kolom bulan sampai Desember 2028. Kontrak yang end date-nya lebih
// jauh dari itu akan di-cap di sini.
const BILLING_SCHEDULE_CAP = new Date(2028, 11, 1);

/**
 * Sengaja pakai aritmatika integer murni (bukan objek Date) buat hitung
 * bulan -- `new Date(y, m, 1)` dikonstruksi di local timezone, sementara
 * `.toISOString()` membaca balik dalam UTC. Kombinasi itu bikin tanggal
 * "mundur" ke bulan sebelumnya (mis. 1 Sept lokal jadi 31 Agu di ISO string),
 * yang bikin seluruh billing schedule geser satu bulan lebih awal dan bulan
 * terakhirnya hilang.
 */
function addMonths(year: number, month1indexed: number, delta: number): { year: number; month: number } {
  const total = month1indexed - 1 + delta;
  return { year: year + Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

function monthKey(year: number, month1indexed: number): string {
  return `${year}-${String(month1indexed).padStart(2, "0")}-01`;
}

async function generateMonthlyBillings(contractId: string, startDate: string, endDate: string, monthlyAmount: number) {
  // Additive-only -- SEBELUMNYA fungsi ini hapus semua baris billing kontrak
  // ini lalu generate ulang semuanya pakai monthlyAmount baru, jadi tiap kali
  // kontrak di-update (termasuk cuma ubah notes/duration) atau price berubah
  // dari Sales, SELURUH bulan (termasuk bulan yang sudah lewat/sudah
  // di-invoice, dan bulan yang sudah diedit manual lewat BillingCell) ikut
  // ketimpa nominal baru. Sekarang cuma nambahin bulan yang BELUM ada baris
  // billing-nya -- bulan yang sudah ada (mau itu hasil generate awal maupun
  // hasil edit manual) tidak pernah disentuh lagi di sini.
  const existing = await db.select({ month: projectMonthlyBillings.month })
    .from(projectMonthlyBillings)
    .where(eq(projectMonthlyBillings.contract_id, contractId));
  const existingMonths = new Set(existing.map((r) => r.month.slice(0, 10)));

  const [startY, startM, startD] = startDate.split("-").map(Number);
  const [endY, endM] = endDate.split("-").map(Number);

  // Kalau start date lewat tanggal 1 di bulan itu, bulan tsb dianggap belum
  // penuh sebulan jadi billing-nya baru mulai bulan berikutnya.
  let { year: cursorY, month: cursorM } = startD > 1 ? addMonths(startY, startM, 1) : { year: startY, month: startM };

  const capY = BILLING_SCHEDULE_CAP.getFullYear();
  const capM = BILLING_SCHEDULE_CAP.getMonth() + 1;
  const endCursorY = endY > capY || (endY === capY && endM > capM) ? capY : endY;
  const endCursorM = endY > capY || (endY === capY && endM > capM) ? capM : endM;

  const months: string[] = [];
  while (cursorY < endCursorY || (cursorY === endCursorY && cursorM <= endCursorM)) {
    const m = monthKey(cursorY, cursorM);
    if (!existingMonths.has(m)) months.push(m);
    ({ year: cursorY, month: cursorM } = addMonths(cursorY, cursorM, 1));
  }

  if (months.length === 0) return;

  await db.insert(projectMonthlyBillings).values(
    months.map((m) => ({ contract_id: contractId, month: m, amount: monthlyAmount }))
  );
}

export async function updateMonthlyBillingAmount(id: string, amount: number) {
  await requirePilotActor();

  await requireDivisionAccess("pmo");
  await db.update(projectMonthlyBillings).set({ amount }).where(eq(projectMonthlyBillings.id, id));
  revalidatePath("/pmo/contracts/billing-schedule");
}