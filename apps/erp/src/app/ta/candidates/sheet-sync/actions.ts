"use server";
import { integrationDisabled } from "@/lib/integration-policy";
import { db } from "@/db";
import { candidates, sheetConnections } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getValidAccessToken, extractSpreadsheetId, readSheetValues, writeSheetValues, clearSheetRange, quoteSheetName } from "@/lib/google-sheets";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { generateCandidateNo } from "@/lib/id-generators";

const DIVISION_KEY = "ta_candidates";

const HEADERS = [
  "Candidate Date", "Candidate Name", "Positions", "Level", "WA Number", "Email",
  "Current Salary", "Expected Salary", "TA PIC", "CV Asli", "Candidate Source", "Candidate Open Status", "Details",
];

const LEVEL_MAP: Record<string, string> = {
  "internship": "internship", "entry level": "entry_level", "junior": "junior",
  "middle": "middle", "senior": "senior", "lead": "lead", "manager": "manager", "vp": "vp",
};
const SOURCE_MAP: Record<string, string> = {
  "hijack linkedin": "hijack_linkedin", "linkedin job portal": "linkedin_job_portal", "glints": "glints",
  "google form celerates": "google_form_celerates", "referral": "referral", "marketing ads": "marketing_ads",
  "hiring partner": "hiring_partner", "linkedin recruiter post": "linkedin_recruiter_post",
  "celerates connect (wa community)": "celerates_connect_wa", "linkedin celerates page": "linkedin_celerates_page",
  "database": "database", "kalibrr": "kalibrr",
};
const OPEN_STATUS_MAP: Record<string, string> = {
  "open to work (dedicated)": "open_dedicated", "already worked": "already_worked", "open (freelance)": "open_freelance",
};

function normalizeValue(value: string, map: Record<string, string>): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const key = trimmed.toLowerCase();
  if (map[key]) return map[key];
  return key.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export async function connectSheet(formData: FormData) {
  await integrationDisabled();

  const url = formData.get("spreadsheet_url") as string;
  const sheetName = (formData.get("sheet_name") as string) || "Sheet1";
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) throw new Error("Link Google Sheet tidak valid");

  const [existing] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, DIVISION_KEY));
  if (existing) {
    await db.update(sheetConnections).set({ spreadsheet_id: spreadsheetId, spreadsheet_url: url, sheet_name: sheetName }).where(eq(sheetConnections.division_key, DIVISION_KEY));
  } else {
    await db.insert(sheetConnections).values({ division_key: DIVISION_KEY, spreadsheet_id: spreadsheetId, spreadsheet_url: url, sheet_name: sheetName });
  }
  revalidatePath("/ta/candidates/sheet-sync");
}

export type HeadersResult = { ok: true; headers: string[] } | { ok: false; error: string };

export async function fetchSheetHeaders(): Promise<HeadersResult> {
  await integrationDisabled();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return { ok: false, error: "Belum login" };

  const [connection] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, DIVISION_KEY));
  if (!connection) return { ok: false, error: "Belum ada Google Sheet yang terhubung" };

  try {
    const accessToken = await getValidAccessToken(userId);
    const rows = await readSheetValues(accessToken, connection.spreadsheet_id, `${quoteSheetName(connection.sheet_name)}!A1:Z1`);
    const headers = (rows[0] ?? []).filter((h) => h.trim() !== "");
    if (headers.length === 0) return { ok: false, error: "Baris header (baris 1) di sheet kosong." };
    return { ok: true, headers };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal baca header" };
  }
}

export async function saveColumnMapping(mapping: Record<string, string>): Promise<void> {
  await integrationDisabled();

  await db.update(sheetConnections).set({ column_mapping: JSON.stringify(mapping) }).where(eq(sheetConnections.division_key, DIVISION_KEY));
  revalidatePath("/ta/candidates/sheet-sync");
}

export type SyncResult = { ok: true; imported: number; skipped: number } | { ok: false; error: string };

export async function syncPull(): Promise<SyncResult> {
  await integrationDisabled();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return { ok: false, error: "Belum login" };

  const [connection] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, DIVISION_KEY));
  if (!connection) return { ok: false, error: "Belum ada Google Sheet yang terhubung" };
  if (!connection.column_mapping) return { ok: false, error: "Belum ada pemetaan kolom." };

  const mapping = JSON.parse(connection.column_mapping) as Record<string, string>;
  const fieldToHeader: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) if (field) fieldToHeader[field] = header;

  try {
    const accessToken = await getValidAccessToken(userId);
    const headerRows = await readSheetValues(accessToken, connection.spreadsheet_id, `${quoteSheetName(connection.sheet_name)}!A1:Z1`);
    const headerRow = headerRows[0] ?? [];
    const columnIndex: Record<string, number> = {};
    for (const [field, header] of Object.entries(fieldToHeader)) {
      const idx = headerRow.indexOf(header);
      if (idx !== -1) columnIndex[field] = idx;
    }

    const dataRows = await readSheetValues(accessToken, connection.spreadsheet_id, `${quoteSheetName(connection.sheet_name)}!A2:Z1000`);
    function cell(row: string[], field: string): string {
      const idx = columnIndex[field];
      return idx !== undefined ? (row[idx] ?? "") : "";
    }

    let imported = 0, skipped = 0;
    for (const row of dataRows) {
      const candidateName = cell(row, "candidate_name");
      const taPic = cell(row, "ta_pic_name");
      if (!candidateName || !taPic) { skipped++; continue; }

      const currentSalaryRaw = cell(row, "current_salary_amount");
      const currentSalaryNum = Number(currentSalaryRaw);
      const expectedSalaryRaw = cell(row, "expected_salary_amount");
      const expectedSalaryNum = Number(expectedSalaryRaw);

      const values = {
        candidate_date: cell(row, "candidate_date") || new Date().toISOString().slice(0, 10),
        candidate_name: candidateName,
        position_name: cell(row, "position_name") || null,
        level_code: normalizeValue(cell(row, "level_code"), LEVEL_MAP) || null,
        wa_number: cell(row, "wa_number") || null,
        email: cell(row, "email")?.trim().toLowerCase() || null,
        current_salary_amount: currentSalaryRaw && !isNaN(currentSalaryNum) ? currentSalaryNum : null,
        expected_salary_amount: expectedSalaryRaw && !isNaN(expectedSalaryNum) ? expectedSalaryNum : null,
        ta_pic_name: taPic,
        cv_asli_url: cell(row, "cv_asli_url") || null,
        candidate_source_code: normalizeValue(cell(row, "candidate_source_code"), SOURCE_MAP) || null,
        candidate_open_status_code: normalizeValue(cell(row, "candidate_open_status_code"), OPEN_STATUS_MAP) || null,
        notes: cell(row, "notes") || null,
      };

      // Sheet nggak punya kolom ID unik buat candidate, jadi dicocokkan dari
      // Candidate Name -- kalau sudah ada di-update, kalau belum baru di-insert.
      const existingCandidate = await db.select().from(candidates).where(eq(candidates.candidate_name, candidateName));
      if (existingCandidate.length > 0) {
        await db.update(candidates).set(values).where(eq(candidates.id, existingCandidate[0].id));
      } else {
        await db.insert(candidates).values({ ...values, candidate_no: await generateCandidateNo(candidateName) });
      }
      imported++;
    }

    revalidatePath("/ta/candidates");
    return { ok: true, imported, skipped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal sync" };
  }
}

export async function syncPush(): Promise<SyncResult> {
  await integrationDisabled();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return { ok: false, error: "Belum login" };

  const [connection] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, DIVISION_KEY));
  if (!connection) return { ok: false, error: "Belum ada Google Sheet yang terhubung" };

  try {
    const accessToken = await getValidAccessToken(userId);
    const allCandidates = await db.select().from(candidates);

    const rows: string[][] = [HEADERS];
    for (const c of allCandidates) {
      rows.push([
        c.candidate_date, c.candidate_name, c.position_name ?? "", c.level_code ?? "",
        c.wa_number ?? "", c.email ?? "", c.current_salary_amount?.toString() ?? "",
        c.expected_salary_amount?.toString() ?? "", c.ta_pic_name, c.cv_asli_url ?? "",
        c.candidate_source_code ?? "", c.candidate_open_status_code ?? "", c.notes ?? "",
      ]);
    }

    const quotedSheetName = quoteSheetName(connection.sheet_name);
    const range = `${quotedSheetName}!A1:M${rows.length}`;
    await clearSheetRange(accessToken, connection.spreadsheet_id, `${quotedSheetName}!A:M`);
    await writeSheetValues(accessToken, connection.spreadsheet_id, range, rows);

    return { ok: true, imported: allCandidates.length, skipped: 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal sync" };
  }
}
export type DebugResult = {
  ok: true;
  savedMapping: Record<string, string>;
  headerRow: string[];
  detectedColumns: Record<string, number>;
  sampleRows: Record<string, string>[];
} | { ok: false; error: string };

export async function debugSync(): Promise<DebugResult> {
  await integrationDisabled();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return { ok: false, error: "Belum login" };

  const [connection] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, DIVISION_KEY));
  if (!connection) return { ok: false, error: "Belum ada Google Sheet yang terhubung" };
  if (!connection.column_mapping) return { ok: false, error: "Belum ada pemetaan kolom." };

  const mapping = JSON.parse(connection.column_mapping) as Record<string, string>;
  const fieldToHeader: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (field) fieldToHeader[field] = header;
  }

  try {
    const accessToken = await getValidAccessToken(userId);
    const headerRows = await readSheetValues(accessToken, connection.spreadsheet_id, `${quoteSheetName(connection.sheet_name)}!A1:Z1`);
    const headerRow = headerRows[0] ?? [];

    const columnIndex: Record<string, number> = {};
    for (const [field, header] of Object.entries(fieldToHeader)) {
      const idx = headerRow.indexOf(header);
      if (idx !== -1) columnIndex[field] = idx;
    }

    const dataRows = await readSheetValues(accessToken, connection.spreadsheet_id, `${quoteSheetName(connection.sheet_name)}!A2:Z4`);

    const sampleRows = dataRows.map((row) => {
      const sample: Record<string, string> = {};
      for (const [field, idx] of Object.entries(columnIndex)) {
        sample[field] = row[idx] ?? "(kosong)";
      }
      return sample;
    });

    return { ok: true, savedMapping: mapping, headerRow, detectedColumns: columnIndex, sampleRows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal debug" };
  }
}
