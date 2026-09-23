"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { companyHolidays, timesheetEntries, timesheetExports, timesheetSubmissions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-log";
import { saveAttachmentsAndLinks, extractFiles, deleteAttachment } from "@/lib/attachments";
import { currentTimesheetActor, assertCanActOnTimesheetRecord, requirePmoFullOrOwner, requireConverterAccess } from "@/lib/require-timesheet-access";
import { parseJiraWorklogXlsx } from "./lib/jira-parser";
import { buildMonthlyCalendar, type CalendarEntryRow } from "./lib/calendar-mapper";
import { generateAstraTimesheetXlsx, type AstraGeneratorRow } from "./lib/astra-generator";
import { TIMESHEET_EXPORT_SOURCE, TIMESHEET_SUBMISSION_SOURCE, MONTH_NAMES_ID, CONVERTER_DEFAULT_CLIENT } from "./constants";

export type DeleteResult = { ok: true } | { ok: false; error: string };
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function periodLabelOf(year: number, month1indexed: number): string {
  return `${MONTH_NAMES_ID[month1indexed - 1]} ${year}`;
}

// ---------- Kalender Libur (Kelola oleh PMO full / Owner) ----------

/** Talent eligible-Converter atau PMO-full/Owner boleh nambah hari libur -- Talent perlu ini supaya bisa lengkapi kalender sendiri sebelum parsing. Hapus tetap PMO-full/Owner saja (lihat deleteHoliday). */
export async function createHoliday(formData: FormData): Promise<void> {
  await requirePilotActor();

  await requireConverterAccess();
  const date = formData.get("date") as string;
  const name = formData.get("name") as string;
  if (!date || !name) throw new Error("Tanggal dan nama hari libur wajib diisi.");

  await db.insert(companyHolidays).values({ date, name }).onConflictDoUpdate({
    target: companyHolidays.date,
    set: { name },
  });

  await logActivity("timesheet", "create", `Hari Libur: ${name} (${date})`, "Timesheet");
  revalidatePath("/timesheet");
}

export async function deleteHoliday(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requirePmoFullOrOwner("full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.delete(companyHolidays).where(eq(companyHolidays.id, id));
  await logActivity("timesheet", "delete", "Hari Libur dihapus", "Timesheet");
  revalidatePath("/timesheet");
  return { ok: true };
}

/**
 * Import massal hari libur (hasil paste teks dari kalender/spreadsheet yang
 * sudah diparsing di client -- lihat holidays-panel.tsx `parseBulkHolidayText`).
 * Sama seperti createHoliday, boleh dipakai Talent eligible-Converter atau
 * PMO-full/Owner -- upsert per tanggal (tanggal yang sudah ada namanya diganti).
 */
export async function bulkCreateHolidays(rows: { date: string; name: string }[]): Promise<ActionResult<{ count: number }>> {
  await requirePilotActor();

  try {
    await requireConverterAccess();
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  if (!rows || rows.length === 0) return { ok: false, error: "Tidak ada data hari libur untuk diimpor." };

  for (const r of rows) {
    if (!r.date || !r.name) continue;
    await db.insert(companyHolidays).values({ date: r.date, name: r.name }).onConflictDoUpdate({
      target: companyHolidays.date,
      set: { name: r.name },
    });
  }

  await logActivity("timesheet", "create", `Import massal ${rows.length} hari libur`, "Timesheet");
  revalidatePath("/timesheet");
  revalidatePath("/timesheet/converter");
  return { ok: true, data: { count: rows.length } };
}

// ---------- Tracker: Submission Timesheet ber-TTD client ----------

/**
 * Talent submit timesheet-nya SENDIRI (user_id selalu diambil dari sesi yang
 * login, bukan dari input form -- supaya tidak mungkin submit atas nama orang
 * lain). Backoffice-PMO-full juga bisa pakai form yang sama untuk dirinya
 * sendiri kalau perlu, tapi peran utama mereka di modul ini adalah approve.
 */
export async function createTimesheetSubmission(formData: FormData): Promise<void> {
  await requirePilotActor();

  const actor = await currentTimesheetActor();

  const client_name = (formData.get("client_name") as string)?.trim();
  const period_start = formData.get("period_start") as string;
  const period_end = formData.get("period_end") as string;

  if (!client_name) throw new Error("Nama client wajib diisi.");
  if (!period_start || !period_end) throw new Error("Periode (mulai & selesai) wajib diisi.");

  const files = extractFiles(formData, "signed_file");
  if (files.length === 0) throw new Error("File PDF timesheet yang sudah di-TTD client wajib diupload.");

  const id = randomUUID();
  await db.insert(timesheetSubmissions).values({ id, user_id: actor.userId, client_name, period_start, period_end });
  await saveAttachmentsAndLinks(TIMESHEET_SUBMISSION_SOURCE, id, { files, links: [] }, actor.userName);

  await logActivity("timesheet", "create", `Submission Timesheet: ${actor.userName} (${period_start} - ${period_end})`, "Timesheet");
  revalidatePath("/timesheet");
}

/** Review/approve cuma boleh PMO-full/Owner -- ini aksi administratif, bukan "punya sendiri". */
export async function approveTimesheetSubmission(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requirePmoFullOrOwner("editor");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  const actor = await currentTimesheetActor();
  await db.update(timesheetSubmissions).set({
    status_code: "approved",
    approved_at: new Date(),
    approved_by_name: actor.userName,
  }).where(eq(timesheetSubmissions.id, id));

  await logActivity("timesheet", "update", "Submission Timesheet disetujui", "Timesheet");
  revalidatePath("/timesheet");
  return { ok: true };
}

/** Talent boleh hapus submission MILIK SENDIRI; PMO-full/Owner boleh hapus siapa pun. */
export async function deleteTimesheetSubmission(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    const actor = await currentTimesheetActor();
    const [row] = await db.select({ user_id: timesheetSubmissions.user_id }).from(timesheetSubmissions).where(eq(timesheetSubmissions.id, id));
    if (!row) return { ok: false, error: "Submission tidak ditemukan." };
    await assertCanActOnTimesheetRecord(actor, row.user_id, "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  await db.delete(timesheetSubmissions).where(eq(timesheetSubmissions.id, id));
  await logActivity("timesheet", "delete", "Submission Timesheet dihapus", "Timesheet");
  revalidatePath("/timesheet");
  return { ok: true };
}

export async function deleteSubmissionAttachment(attachmentId: string, submissionId: string): Promise<void> {
  await requirePilotActor();

  const actor = await currentTimesheetActor();
  const [row] = await db.select({ user_id: timesheetSubmissions.user_id }).from(timesheetSubmissions).where(eq(timesheetSubmissions.id, submissionId));
  if (!row) throw new Error("Submission tidak ditemukan.");
  await assertCanActOnTimesheetRecord(actor, row.user_id, "full");
  await deleteAttachment(attachmentId);
  await logActivity("timesheet", "delete", "Lampiran Submission Timesheet dihapus", "Timesheet");
  revalidatePath("/timesheet");
}

// ---------- Converter: Parse & Preview (belum disimpan ke DB) ----------

export type ConverterPreviewRow = CalendarEntryRow;
export type ConverterPreviewResult = {
  rows: ConverterPreviewRow[];
  fullName: string;
  year: number;
  month: number;
};

/**
 * Upload worklog Jira Tempo (.xlsx), parse, auto-fill kalender sebulan penuh.
 * Periode (Tahun/Bulan) TIDAK diminta ke user di awal -- ditebak otomatis dari
 * tanggal baris pertama hasil parsing (sudah terurut kronologis), persis
 * seperti endpoint /api/upload di server.js proyek lama:
 * `year = entries[0].workDate.getFullYear()`. Nama Lengkap juga ditebak dari
 * baris pertama, tapi tetap bisa diedit user di panel sebelum generate.
 * Talent eligible atau Backoffice-PMO-full boleh pakai (PMO full bisa
 * generate "atas nama" talent mana pun karena tidak ada FK ke data karyawan).
 */
export async function parseAndPreviewConverter(formData: FormData): Promise<ActionResult<ConverterPreviewResult>> {
  await requirePilotActor();

  try {
    await requireConverterAccess();
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  const file = formData.get("jira_file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "File worklog Jira Tempo (.xlsx) wajib diupload." };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsedRows = await parseJiraWorklogXlsx(buffer);
    if (parsedRows.length === 0) return { ok: false, error: "Tidak ada data worklog yang bisa dibaca dari file ini." };

    const firstRow = parsedRows[0];
    const year = Number(firstRow.work_date.slice(0, 4));
    const month = Number(firstRow.work_date.slice(5, 7));

    const holidays = await db.select({ date: companyHolidays.date, name: companyHolidays.name }).from(companyHolidays);
    const calendarRows = buildMonthlyCalendar(parsedRows, year, month, holidays);
    return { ok: true, data: { rows: calendarRows, fullName: firstRow.full_name, year, month } };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "Gagal memproses file." };
  }
}

// ---------- Converter: Save entries + Generate .xlsx resmi Astra ----------

export type GenerateConverterPayload = {
  talent_display_name: string;
  year: number;
  month: number;
  rows: ConverterPreviewRow[];
};

export type GeneratedFile = { fileName: string; base64: string };

/** Ambil Project Name paling relevan dari baris-baris kerja (bukan placeholder) buat ringkasan client_name di riwayat -- fallback ke nama client default kalau semua baris kosong/placeholder. */
function summaryClientNameOf(rows: ConverterPreviewRow[]): string {
  const found = rows.find((r) => !r.is_empty && r.project_name && r.project_name !== "-");
  return found?.project_name || CONVERTER_DEFAULT_CLIENT;
}

/** Simpan (replace) baris timesheet_entries untuk actor+periode ini, lalu generate file .xlsx format resmi Astra. */
export async function saveAndGenerateConverter(payload: GenerateConverterPayload): Promise<ActionResult<GeneratedFile>> {
  await requirePilotActor();

  let actor;
  try {
    actor = await requireConverterAccess();
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  if (!payload.talent_display_name?.trim()) return { ok: false, error: "Nama Lengkap wajib diisi." };
  if (!payload.year || !payload.month) return { ok: false, error: "Periode tidak valid." };
  if (!payload.rows || payload.rows.length === 0) return { ok: false, error: "Tidak ada baris untuk disimpan." };
  if (payload.rows.some((r) => !r.entry_date)) return { ok: false, error: "Ada baris dengan tanggal kosong, lengkapi dulu." };

  const clientName = summaryClientNameOf(payload.rows);

  await db.delete(timesheetEntries).where(
    and(
      eq(timesheetEntries.user_id, actor.userId),
      eq(timesheetEntries.period_year, payload.year),
      eq(timesheetEntries.period_month, payload.month)
    )
  );

  await db.insert(timesheetEntries).values(
    payload.rows.map((r) => ({
      user_id: actor.userId,
      client_name: r.project_name && r.project_name !== "-" ? r.project_name : clientName,
      period_year: payload.year,
      period_month: payload.month,
      entry_date: r.entry_date,
      hours: r.hours,
      issue_key: r.issue_key,
      issue_summary: r.issue_summary,
      activity_type: r.activity_type,
      is_empty: r.is_empty,
    }))
  );

  const generatorRows: AstraGeneratorRow[] = payload.rows.map((r) => ({
    entry_date: r.entry_date,
    issueKey: r.issue_key,
    issueSummary: r.issue_summary,
    hours: r.hours,
    isEmpty: r.is_empty,
    username: r.username && r.username !== "-" ? r.username : payload.talent_display_name,
    fullName: r.full_name && r.full_name !== "-" ? r.full_name : payload.talent_display_name,
    period: r.period,
    projectName: r.project_name,
    activityType: r.activity_type,
  }));

  const buffer = await generateAstraTimesheetXlsx({
    talentDisplayName: payload.talent_display_name,
    clientName,
    rows: generatorRows,
  });

  const totalHours = payload.rows.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
  const totalMd = totalHours / 8;

  const exportId = randomUUID();
  const safeName = payload.talent_display_name.replace(/[^a-zA-Z0-9]+/g, "_");
  const fileName = `Timesheet_${safeName}_${payload.year}-${String(payload.month).padStart(2, "0")}.xlsx`;
  const file = new File([buffer], fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  await db.insert(timesheetExports).values({
    id: exportId,
    user_id: actor.userId,
    client_name: clientName,
    period_year: payload.year,
    period_month: payload.month,
    total_hours: totalHours,
    total_md: totalMd,
    generated_by_name: actor.userName,
  });

  await saveAttachmentsAndLinks(TIMESHEET_EXPORT_SOURCE, exportId, { files: [file], links: [] }, actor.userName);

  await logActivity("timesheet", "create", `Generate Timesheet Astra: ${payload.talent_display_name} (${periodLabelOf(payload.year, payload.month)})`, "Timesheet Converter");
  revalidatePath("/timesheet/converter");
  revalidatePath("/timesheet");
  return { ok: true, data: { fileName, base64: buffer.toString("base64") } };
}
