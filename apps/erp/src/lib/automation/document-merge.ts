import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { db } from "@/db";
import { automationDocumentTemplates, automationGeneratedDocuments, onboardingRequests, candidates, requisitions, employees, opportunities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptPII } from "@/lib/pii-crypto";
import { prettify } from "@/components/dashboard-charts";
import { downloadFromStorage, uploadGeneratedDocument, getSignedUrl } from "./storage";
import { extractDocxTags, findRemainingBlanks } from "./docx-inspect";
import { autoFillDocx, debugTableRows, type TableDebugRow } from "./docx-autofill";
import { docxToPreviewHtml } from "./docx-preview";

const GENDER_LABELS: Record<string, string> = { male: "Laki-laki", female: "Perempuan" };

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh",
  "sebelas", "dua belas", "tiga belas", "empat belas", "lima belas", "enam belas", "tujuh belas", "delapan belas", "sembilan belas"];

/** Terbilang sederhana -- cukup buat rentang durasi kontrak (bulan/tahun), bukan general-purpose. */
function terbilang(n: number): string {
  if (n < 20) return SATUAN[n];
  if (n < 100) {
    const puluhan = Math.floor(n / 10);
    const sisa = n % 10;
    return `${puluhan === 1 ? "sepuluh" : `${SATUAN[puluhan]} puluh`}${sisa ? ` ${SATUAN[sisa]}` : ""}`;
  }
  const ratusan = Math.floor(n / 100);
  const sisa = n % 100;
  return `${ratusan === 1 ? "seratus" : `${SATUAN[ratusan]} ratus`}${sisa ? ` ${terbilang(sisa)}` : ""}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatMoney(value: number | null): string {
  if (!value) return "-";
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function dateParts(value: string | null): { hari: string; bulan: string; tahun: string; slash: string } {
  if (!value) return { hari: "-", bulan: "-", tahun: "-", slash: "-" };
  const d = new Date(value);
  return {
    hari: String(d.getDate()),
    bulan: d.toLocaleDateString("id-ID", { month: "long" }),
    tahun: String(d.getFullYear()),
    slash: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
  };
}

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "-";
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return String(age);
}

function calcDurationMonths(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

async function buildMergeData(onboardingRequestId: string): Promise<Record<string, string>> {
  const [onboarding] = await db.select().from(onboardingRequests).where(eq(onboardingRequests.id, onboardingRequestId));
  if (!onboarding) throw new Error("Onboarding request tidak ditemukan");

  const [candidate] = onboarding.candidate_id
    ? await db.select().from(candidates).where(eq(candidates.id, onboarding.candidate_id))
    : [undefined];

  const [requisition] = onboarding.requisition_id
    ? await db.select().from(requisitions).where(eq(requisitions.id, onboarding.requisition_id))
    : [undefined];

  // Employee_no baru ada SETELAH talent di-promote jadi Employee -- kalau kontrak
  // digenerate sebelum promote, dua field ini ("ID Pegawai" & "No. Induk Karyawan"
  // di draft kontrak merujuk ke nomor yang sama) akan tampil "-".
  const [employee] = await db.select().from(employees).where(eq(employees.onboarding_request_id, onboardingRequestId));

  // Business Unit disimpan di Opportunity (Sales), bukan di Onboarding -- cuma ada
  // kalau onboarding ini memang berasal dari sebuah Opportunity yang sudah di-link.
  const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.onboarding_request_id, onboardingRequestId));

  const startParts = dateParts(onboarding.start_date);
  const endParts = dateParts(onboarding.end_date);
  const todayParts = dateParts(new Date().toISOString());
  const todayDayName = new Date().toLocaleDateString("id-ID", { weekday: "long" });
  const durationMonths = calcDurationMonths(onboarding.start_date, onboarding.end_date);

  const grossSalary = [
    onboarding.basic_salary_amount, onboarding.functional_allowance_amount, onboarding.transport_allowance_amount,
    onboarding.project_allowance_amount, onboarding.accommodation_allowance_amount, onboarding.field_allowance_amount,
    onboarding.overtime_allowance_amount,
  ].reduce((sum: number, v) => sum + (v ?? 0), 0);

  return {
    // -- Data Pribadi Talent --
    nama: candidate?.candidate_name ?? "-",
    email: onboarding.personal_email ?? candidate?.email ?? "-",
    no_tlp: onboarding.personal_phone ?? candidate?.wa_number ?? "-",
    alamat: onboarding.id_card_address ?? "-",
    alamat_domisili: onboarding.current_address ?? "-",
    nik: decryptPII(onboarding.nik) ?? "-",
    npwp: decryptPII(onboarding.npwp) ?? "-",
    tempat_lahir: onboarding.birth_place ?? "-",
    tanggal_lahir: formatDate(onboarding.birth_date),
    umur: calcAge(onboarding.birth_date),
    jenis_kelamin: onboarding.gender_code ? (GENDER_LABELS[onboarding.gender_code] ?? onboarding.gender_code) : "-",

    // -- Data Kepegawaian --
    id_pegawai: employee?.employee_no ?? "-",
    no_induk_karyawan: employee?.employee_no ?? "-",
    jabatan: requisition?.position_name ?? employee?.position_name ?? "-",
    business_unit: opportunity?.business_unit_code ? prettify(opportunity.business_unit_code) : "-",

    // -- Kontrak --
    tanggal_ttd: formatDate(new Date().toISOString()),
    tanggal_dokumen: formatDate(new Date().toISOString()),
    hari_ttd: todayDayName,
    tanggal_ttd_hari: todayParts.hari,
    tanggal_ttd_bulan: todayParts.bulan,
    tanggal_ttd_tahun: todayParts.tahun,
    tanggal_ttd_slash: todayParts.slash,
    tanggal_mulai: formatDate(onboarding.start_date),
    tanggal_mulai_hari: startParts.hari,
    tanggal_mulai_bulan: startParts.bulan,
    tanggal_mulai_tahun: startParts.tahun,
    tanggal_mulai_slash: startParts.slash,
    tanggal_selesai: formatDate(onboarding.end_date),
    tanggal_selesai_hari: endParts.hari,
    tanggal_selesai_bulan: endParts.bulan,
    tanggal_selesai_tahun: endParts.tahun,
    tanggal_selesai_slash: endParts.slash,
    durasi_bulan: durationMonths !== null ? String(durationMonths) : "-",
    durasi_terbilang: durationMonths !== null ? terbilang(durationMonths) : "-",

    // -- Kompensasi --
    gaji: formatMoney(onboarding.salary_deal_amount),
    gaji_pokok: formatMoney(onboarding.basic_salary_amount),
    tunjangan_transportasi: formatMoney(onboarding.transport_allowance_amount),
    tunjangan_penugasan_proyek: formatMoney(onboarding.project_allowance_amount),
    tunjangan_akomodasi: formatMoney(onboarding.accommodation_allowance_amount),
    total_gross_gaji: formatMoney(grossSalary),
    nama_bank: onboarding.bank_name ?? "-",
    no_rekening: decryptPII(onboarding.bank_account_no) ?? "-",
    nama_pemilik_rekening: onboarding.bank_account_holder_name ?? "-",
  };
}

type RenderOutcome = { buffer: Buffer; autoFilledLabels: string[] };

/**
 * Render template + data jadi buffer .docx hasil merge -- TANPA upload/simpan
 * apa pun (dipakai baik oleh preview maupun generate final). Dua mekanisme
 * dipakai berurutan supaya user TIDAK WAJIB edit template sama sekali:
 *  1. autoFillDocx -- cocokkan label yang SUDAH ADA di draft (mis. "Nama : ....")
 *     ke data, timpa langsung. Ini yang jalan untuk template apa adanya.
 *  2. docxtemplater -- kalau template JUGA punya tag eksplisit {nama} dst
 *     (opsional, buat kasus yang tidak tertangkap pola label otomatis), tetap
 *     diproses di sini. Kalau tidak ada tag sama sekali, langkah ini no-op.
 */
function renderMergedDocx(templateBuffer: Buffer, mergeData: Record<string, string>): RenderOutcome {
  const { buffer: autoFilledBuffer, filledLabels } = autoFillDocx(templateBuffer, mergeData);

  const zip = new PizZip(autoFilledBuffer);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  try {
    doc.render(mergeData);
  } catch (error: any) {
    // docxtemplater ngelempar 1 error dengan `properties.errors` isinya array --
    // biasanya karena tag di Word "kepotong" jadi beberapa run (efek autocorrect/
    // format berbeda per kata) atau nama tag salah ketik/tidak dikenal. Tanpa ini
    // pesan errornya cuma "Multi error" doang, nggak actionable buat user.
    const details: string[] = error?.properties?.errors?.map((e: any) => e?.properties?.explanation).filter(Boolean) ?? [];
    const supported = Object.keys(mergeData).map((k) => `{${k}}`).join(", ");
    throw new Error(
      details.length > 0
        ? `Template bermasalah:\n${details.join("\n")}\n\nTag yang didukung: ${supported}`
        : `Gagal merge template: ${error?.message ?? "unknown error"}. Tag yang didukung: ${supported}`
    );
  }

  return { buffer: doc.getZip().generate({ type: "nodebuffer" }) as Buffer, autoFilledLabels: filledLabels };
}

export type PreviewResult = {
  previewHtml: string;
  foundTags: string[];
  unknownTags: string[];
  autoFilledLabels: string[];
  remainingBlanks: string[];
  tableDebug: TableDebugRow[];
};

/**
 * Render di memori TANPA disimpan ke storage/DB -- dipakai tombol "Preview"
 * biar user bisa cek hasil merge-nya bener dulu sebelum ke-generate beneran
 * (dan nggak numpuk record `automation_generated_documents` tiap kali coba-coba).
 */
export async function previewDocumentFromTemplate(templateId: string, onboardingRequestId: string): Promise<PreviewResult> {
  const [template] = await db.select().from(automationDocumentTemplates).where(eq(automationDocumentTemplates.id, templateId));
  if (!template) throw new Error("Template tidak ditemukan");

  const templateBuffer = await downloadFromStorage(template.storage_path);
  const mergeData = await buildMergeData(onboardingRequestId);

  const foundTags = extractDocxTags(templateBuffer);
  const knownTags = new Set(Object.keys(mergeData));
  const unknownTags = foundTags.filter((t) => !knownTags.has(t));

  const { buffer: outputBuffer, autoFilledLabels } = renderMergedDocx(templateBuffer, mergeData);
  const previewHtml = await docxToPreviewHtml(outputBuffer);
  const remainingBlanks = findRemainingBlanks(outputBuffer);
  const tableDebug = debugTableRows(templateBuffer);

  return { previewHtml, foundTags, unknownTags, autoFilledLabels, remainingBlanks, tableDebug };
}

/**
 * Generate dokumen (Kontrak/Offering) dari template .docx yang sudah diupload,
 * di-merge dengan data 1 onboarding request, DISIMPAN ke storage + dicatat di
 * automation_generated_documents. Output tetap .docx (bukan PDF -- konversi
 * PDF butuh service tambahan yang belum ada di infra sekarang).
 */
export async function generateDocumentFromTemplate(templateId: string, onboardingRequestId: string): Promise<{ signedUrl: string }> {
  const [template] = await db.select().from(automationDocumentTemplates).where(eq(automationDocumentTemplates.id, templateId));
  if (!template) throw new Error("Template tidak ditemukan");

  const templateBuffer = await downloadFromStorage(template.storage_path);
  const mergeData = await buildMergeData(onboardingRequestId);
  const { buffer: outputBuffer } = renderMergedDocx(templateBuffer, mergeData);

  const fileName = `${mergeData.nama.replace(/[^a-zA-Z0-9]+/g, "-")}.docx`;
  const storagePath = await uploadGeneratedDocument(outputBuffer, onboardingRequestId, template.type as "contract" | "offering", fileName);

  await db.insert(automationGeneratedDocuments).values({
    template_id: templateId,
    onboarding_request_id: onboardingRequestId,
    storage_path: storagePath,
  });

  const signedUrl = await getSignedUrl(storagePath);
  if (!signedUrl) throw new Error("Dokumen berhasil dibuat tapi gagal ambil link download");
  return { signedUrl };
}
