"use server";
import { integrationDisabled } from "@/lib/integration-policy";
import { db } from "@/db";
import { talentAssignments, employees, requisitions, sheetConnections } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getValidAccessToken, extractSpreadsheetId, readSheetValues, writeSheetValues, clearSheetRange, quoteSheetName } from "@/lib/google-sheets";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

const DIVISION_KEY = "tm_talent_assignment";

const HEADERS = [
  "Employee No", "Client Name", "Start Date", "End Date", "Status", "Talent Track", "Current Grading",
  "Current Salary Grade", "Price", "Current Skill", "Current Certification",
  "Performance Appraisal Result", "Performance Review Result", "Basic Salary", "Functional Allowance",
  "Transport Allowance", "Project Allowance", "Accommodation Allowance", "Uang Lapangan", "Overtime", "Notes",
];

const STATUS_MAP: Record<string, string> = {
  "on project": "on_project", "idle": "idle", "out": "out", "internal project": "internal_project",
  "resignation on progress": "resignation_on_progress", "waiting for project onboard": "waiting_for_project_onboard",
  "not in assignment": "not_in_assignment", "promote": "promote",
};
const TRACK_MAP: Record<string, string> = { "pm": "pm", "sad": "sad", "bdcs": "bdcs", "das": "das" };
const GRADING_MAP: Record<string, string> = { "g1": "g1", "g2": "g2", "g3": "g3", "g4": "g4", "g5": "g5", "g6": "g6", "g7": "g7" };

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
  revalidatePath("/tm/sheet-sync");
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
  revalidatePath("/tm/sheet-sync");
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
      const employeeNo = cell(row, "employee_no");
      if (!employeeNo) { skipped++; continue; }

      const [employee] = await db.select().from(employees).where(eq(employees.employee_no, employeeNo));
      if (!employee) { skipped++; continue; }

      const clientNameCell = cell(row, "client_name");
      let requisitionId: string | null = null;
      if (clientNameCell) {
        const [req] = await db.select().from(requisitions).where(eq(requisitions.client_name, clientNameCell));
        requisitionId = req?.id ?? null;
      }

      const numFields = ["price_amount", "basic_salary_amount", "functional_allowance_amount", "transport_allowance_amount",
        "project_allowance_amount", "accommodation_allowance_amount", "field_allowance_amount", "overtime_allowance_amount"];
      const nums: Record<string, number | null> = {};
      for (const f of numFields) {
        const raw = cell(row, f);
        const n = Number(raw);
        nums[f] = raw && !isNaN(n) ? n : null;
      }

      const values = {
        employee_id: employee.id,
        requisition_id: requisitionId,
        start_date: cell(row, "start_date") || null,
        end_date: cell(row, "end_date") || null,
        status_code: normalizeValue(cell(row, "status_code"), STATUS_MAP) || null,
        talent_track_code: normalizeValue(cell(row, "talent_track_code"), TRACK_MAP) || null,
        current_grading: normalizeValue(cell(row, "current_grading"), GRADING_MAP) || null,
        current_salary_grade_code: cell(row, "current_salary_grade_code") || null,
        price_amount: nums.price_amount,
        current_skill: cell(row, "current_skill") || null,
        current_certification: cell(row, "current_certification") || null,
        performance_appraisal_result: cell(row, "performance_appraisal_result") || null,
        performance_review_result: cell(row, "performance_review_result") || null,
        basic_salary_amount: nums.basic_salary_amount,
        functional_allowance_amount: nums.functional_allowance_amount,
        transport_allowance_amount: nums.transport_allowance_amount,
        project_allowance_amount: nums.project_allowance_amount,
        accommodation_allowance_amount: nums.accommodation_allowance_amount,
        field_allowance_amount: nums.field_allowance_amount,
        overtime_allowance_amount: nums.overtime_allowance_amount,
        notes: cell(row, "notes") || null,
      };

      // Satu employee = satu Talent Assignment dari sheet ini -- update kalau
      // sudah ada baris buat employee tsb, biar nggak dobel tiap kali pull.
      const [existingAssignment] = await db.select().from(talentAssignments).where(eq(talentAssignments.employee_id, employee.id));
      if (existingAssignment) {
        await db.update(talentAssignments).set(values).where(eq(talentAssignments.id, existingAssignment.id));
      } else {
        await db.insert(talentAssignments).values(values);
      }
      imported++;
    }

    revalidatePath("/tm");
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
    const allAssignments = await db
      .select({
        employee_no: employees.employee_no,
        client_name: requisitions.client_name,
        start_date: talentAssignments.start_date,
        end_date: talentAssignments.end_date,
        status_code: talentAssignments.status_code,
        talent_track_code: talentAssignments.talent_track_code,
        current_grading: talentAssignments.current_grading,
        current_salary_grade_code: talentAssignments.current_salary_grade_code,
        price_amount: talentAssignments.price_amount,
        current_skill: talentAssignments.current_skill,
        current_certification: talentAssignments.current_certification,
        performance_appraisal_result: talentAssignments.performance_appraisal_result,
        performance_review_result: talentAssignments.performance_review_result,
        basic_salary_amount: talentAssignments.basic_salary_amount,
        functional_allowance_amount: talentAssignments.functional_allowance_amount,
        transport_allowance_amount: talentAssignments.transport_allowance_amount,
        project_allowance_amount: talentAssignments.project_allowance_amount,
        accommodation_allowance_amount: talentAssignments.accommodation_allowance_amount,
        field_allowance_amount: talentAssignments.field_allowance_amount,
        overtime_allowance_amount: talentAssignments.overtime_allowance_amount,
        notes: talentAssignments.notes,
      })
      .from(talentAssignments)
      .leftJoin(employees, eq(talentAssignments.employee_id, employees.id))
      .leftJoin(requisitions, eq(talentAssignments.requisition_id, requisitions.id));

    const rows: string[][] = [HEADERS];
    for (const a of allAssignments) {
      rows.push([
        a.employee_no ?? "", a.client_name ?? "", a.start_date ?? "", a.end_date ?? "",
        a.status_code ?? "", a.talent_track_code ?? "", a.current_grading ?? "", a.current_salary_grade_code ?? "",
        a.price_amount?.toString() ?? "", a.current_skill ?? "", a.current_certification ?? "",
        a.performance_appraisal_result ?? "", a.performance_review_result ?? "",
        a.basic_salary_amount?.toString() ?? "", a.functional_allowance_amount?.toString() ?? "",
        a.transport_allowance_amount?.toString() ?? "", a.project_allowance_amount?.toString() ?? "",
        a.accommodation_allowance_amount?.toString() ?? "", a.field_allowance_amount?.toString() ?? "",
        a.overtime_allowance_amount?.toString() ?? "", a.notes ?? "",
      ]);
    }

    const quotedSheetName = quoteSheetName(connection.sheet_name);
    const range = `${quotedSheetName}!A1:U${rows.length}`;
    await clearSheetRange(accessToken, connection.spreadsheet_id, `${quotedSheetName}!A:U`);
    await writeSheetValues(accessToken, connection.spreadsheet_id, range, rows);

    return { ok: true, imported: allAssignments.length, skipped: 0 };
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
