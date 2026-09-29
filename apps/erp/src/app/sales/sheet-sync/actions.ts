"use server";
import { integrationDisabled } from "@/lib/integration-policy";
import { db } from "@/db";
import { opportunities, sheetConnections } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getValidAccessToken, extractSpreadsheetId, readSheetValues, writeSheetValues, clearSheetRange, quoteSheetName } from "@/lib/google-sheets";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { generateOptyNoWithPosition, generatePqNo } from "@/lib/id-generators";

const DIVISION_KEY = "sales";

const HEADERS = [
  "ID Opty", "PQ Number", "Pipeline Stage", "Opty Status", "Client Name", "Client Type", "Project Name",
  "Positions", "Service Type", "Business Unit", "Level", "Headcount", "Priority", "BANTE Score",
  "Price", "Opty Request Date", "Approval Date", "PO Doc", "Sales PIC", "Notes",
];

function normalizeValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export async function connectSheet(formData: FormData) {
  await integrationDisabled();

  const url = formData.get("spreadsheet_url") as string;
  const sheetName = (formData.get("sheet_name") as string) || "Sheet1";
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) throw new Error("Link Google Sheet tidak valid");

  const [existing] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, DIVISION_KEY));
  if (existing) {
    await db.update(sheetConnections).set({
      spreadsheet_id: spreadsheetId, spreadsheet_url: url, sheet_name: sheetName,
    }).where(eq(sheetConnections.division_key, DIVISION_KEY));
  } else {
    await db.insert(sheetConnections).values({
      division_key: DIVISION_KEY, spreadsheet_id: spreadsheetId, spreadsheet_url: url, sheet_name: sheetName,
    });
  }

  revalidatePath("/sales/sheet-sync");
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

  await db.update(sheetConnections).set({
    column_mapping: JSON.stringify(mapping),
  }).where(eq(sheetConnections.division_key, DIVISION_KEY));
  revalidatePath("/sales/sheet-sync");
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

    const dataRows = await readSheetValues(accessToken, connection.spreadsheet_id, `${quoteSheetName(connection.sheet_name)}!A2:Z1000`);

    function cell(row: string[], field: string): string {
      const idx = columnIndex[field];
      return idx !== undefined ? (row[idx] ?? "") : "";
    }

    let imported = 0;
    let skipped = 0;

    for (const row of dataRows) {
      const clientName = cell(row, "client_name");
      const projectName = cell(row, "project_name");
      const serviceTypeRaw = cell(row, "service_type_code");
      const salesPic = cell(row, "sales_pic_name");

      if (!clientName || !projectName || !serviceTypeRaw || !salesPic) { skipped++; continue; }

      const service_type_code = normalizeValue(serviceTypeRaw)!;
      const business_unit_code = normalizeValue(cell(row, "business_unit_code"));
      const level_code = normalizeValue(cell(row, "level_code"));
      const priority_code = normalizeValue(cell(row, "priority_code"));
      const pipeline_stage_code = normalizeValue(cell(row, "pipeline_stage_code")) ?? "on_going";
      const opty_status_code = normalizeValue(cell(row, "opty_status_code"));
      const client_type_code = normalizeValue(cell(row, "client_type_code"));

      const optyNoFromSheet = cell(row, "opty_no");
      const pqNoFromSheet = cell(row, "pq_no");
      const positionName = cell(row, "position_name") || null;

      const opty_no = optyNoFromSheet || await generateOptyNoWithPosition(clientName, positionName ?? "", business_unit_code ?? "");
      const pq_no = pqNoFromSheet || await generatePqNo(clientName, positionName ?? "", business_unit_code ?? "");

      const headcountRaw = cell(row, "headcount_target");
      const headcountNum = Number(headcountRaw);
      const bantRaw = cell(row, "bant_score");
      const bantNum = Number(bantRaw);
      const priceRaw = cell(row, "price_amount");
      const priceNum = Number(priceRaw);

      const existingOpty = optyNoFromSheet ? await db.select().from(opportunities).where(eq(opportunities.opty_no, optyNoFromSheet)) : [];

      const values = {
        opty_no,
        pq_no,
        client_name: clientName,
        client_type_code,
        project_name: projectName,
        position_name: positionName,
        service_type_code,
        business_unit_code,
        level_code,
        headcount_target: headcountRaw && !isNaN(headcountNum) ? headcountNum : null,
        priority_code,
        bant_score: bantRaw && !isNaN(bantNum) ? bantNum : null,
        price_amount: priceRaw && !isNaN(priceNum) ? priceNum : null,
        opty_request_date: cell(row, "opty_request_date") || null,
        approval_date: cell(row, "approval_date") || null,
        po_doc_url: cell(row, "po_doc_url") || null,
        sales_pic_name: salesPic,
        pipeline_stage_code,
        opty_status_code,
        notes: cell(row, "notes") || null,
      };

      if (existingOpty.length > 0) {
        await db.update(opportunities).set(values).where(eq(opportunities.id, existingOpty[0].id));
      } else {
        await db.insert(opportunities).values(values);
      }
      imported++;
    }

    revalidatePath("/sales");
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
    const allOpportunities = await db.select().from(opportunities);

    const rows: string[][] = [HEADERS];
    for (const o of allOpportunities) {
      rows.push([
        o.opty_no,
        o.pq_no ?? "",
        o.pipeline_stage_code,
        o.opty_status_code ?? "",
        o.client_name,
        o.client_type_code ?? "",
        o.project_name,
        o.position_name ?? "",
        o.service_type_code,
        o.business_unit_code ?? "",
        o.level_code ?? "",
        o.headcount_target?.toString() ?? "",
        o.priority_code ?? "",
        o.bant_score?.toString() ?? "",
        o.price_amount?.toString() ?? "",
        o.opty_request_date ?? "",
        o.approval_date ?? "",
        o.po_doc_url ?? "",
        o.sales_pic_name,
        o.notes ?? "",
      ]);
    }

    const quotedSheetName = quoteSheetName(connection.sheet_name);
    const range = `${quotedSheetName}!A1:T${rows.length}`;
    await clearSheetRange(accessToken, connection.spreadsheet_id, `${quotedSheetName}!A:T`);
    await writeSheetValues(accessToken, connection.spreadsheet_id, range, rows);

    return { ok: true, imported: allOpportunities.length, skipped: 0 };
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
