import ExcelJS from "exceljs";
import { REQUIRED_JIRA_HEADERS, MONTH_NAMES_ID } from "../constants";

export type ParsedWorklogRow = {
  issue_key: string;
  issue_summary: string;
  hours: number;
  work_date: string; // ISO yyyy-mm-dd
  username: string;
  full_name: string;
  project_name: string;
  activity_type: string;
  period: string; // "<NamaBulan> <Tahun>", dihitung dari work_date sendiri
};

function periodOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTH_NAMES_ID[m - 1]} ${y}`;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    // Rich text / formula result cell
    const anyVal = value as any;
    if (typeof anyVal.text === "string") return anyVal.text;
    if (anyVal.result != null) return cellText(anyVal.result);
    if (Array.isArray(anyVal.richText)) return anyVal.richText.map((r: any) => r.text).join("");
  }
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number {
  if (typeof value === "number") return value;
  const text = cellText(value).replace(",", ".").trim();
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

/** Excel serial date (basis 1899-12-30) -- dipakai kalau cell "Work date" tersimpan sebagai angka, bukan Date object. */
function excelSerialToDate(serial: number): Date {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + serial * 86400000);
}

function toIsoDate(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return excelSerialToDate(value).toISOString().slice(0, 10);
  const text = cellText(value).trim();
  if (!text) return null;

  // yyyy-mm-dd atau yyyy/mm/dd
  let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // dd-mm-yyyy atau dd/mm/yyyy
  m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Parse file export worklog Jira Tempo (.xlsx). Melempar Error berbahasa
 * Indonesia yang jelas kalau ada kolom wajib yang hilang, supaya user tahu
 * persis file mana yang harus diperbaiki/di-export ulang.
 */
export async function parseJiraWorklogXlsx(buffer: Buffer): Promise<ParsedWorklogRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("File Excel tidak punya sheet apa pun.");
  }

  const headerRow = worksheet.getRow(1);
  const columnIndexByHeader = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeHeader(cellText(cell.value));
    if (normalized) columnIndexByHeader.set(normalized, colNumber);
  });

  const missing = REQUIRED_JIRA_HEADERS.filter((h) => !columnIndexByHeader.has(normalizeHeader(h)));
  if (missing.length > 0) {
    throw new Error(
      `Kolom wajib berikut tidak ditemukan di file yang diupload: ${missing.join(", ")}. ` +
      `Pastikan file export worklog Jira Tempo punya semua kolom: ${REQUIRED_JIRA_HEADERS.join(", ")}.`
    );
  }

  const colOf = (header: string) => columnIndexByHeader.get(normalizeHeader(header))!;
  const rows: ParsedWorklogRow[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const issueKey = cellText(row.getCell(colOf("Issue Key")).value);
    const workDateRaw = row.getCell(colOf("Work date")).value;
    const isRowEmpty = !issueKey && !workDateRaw;
    if (isRowEmpty) return;

    const workDate = toIsoDate(workDateRaw);
    if (!workDate) {
      throw new Error(`Baris ${rowNumber}: kolom "Work date" tidak bisa dibaca sebagai tanggal yang valid.`);
    }

    rows.push({
      issue_key: issueKey,
      issue_summary: cellText(row.getCell(colOf("Issue summary")).value),
      hours: cellNumber(row.getCell(colOf("Hours")).value),
      work_date: workDate,
      username: cellText(row.getCell(colOf("Username")).value),
      full_name: cellText(row.getCell(colOf("Full name")).value),
      project_name: cellText(row.getCell(colOf("Project Name")).value),
      activity_type: cellText(row.getCell(colOf("Activity Type")).value),
      period: periodOf(workDate),
    });
  });

  // Urutkan kronologis -- baris pertama dipakai buat menebak Tahun/Bulan &
  // Nama Lengkap default, persis seperti entries[0] di parser.js lama.
  rows.sort((a, b) => a.work_date.localeCompare(b.work_date));

  return rows;
}
