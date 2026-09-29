"use server";
import { integrationDisabled } from "@/lib/integration-policy";
import { db } from "@/db";
import { requisitions, sheetConnections } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getValidAccessToken, extractSpreadsheetId, readSheetValues, writeSheetValues, clearSheetRange, quoteSheetName } from "@/lib/google-sheets";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { generateRequisitionNo } from "@/lib/id-generators";

const DIVISION_KEY = "ta_requisition";

const HEADERS = [
  "Requisition No", "Opty Request Date", "Client Name", "Positions", "Service Type", "Level", "Opty Status",
  "Headcount", "Priority", "Price", "TA PIC", "Details",
];

const SERVICE_TYPE_MAP: Record<string, string> = {
  "outsourcing": "outsourcing", "headhunting": "headhunting", "outplacement": "outplacement",
  "manage service": "managed_service", "managed service": "managed_service", "project based": "project_based",
  "rpo": "rpo", "training": "training", "license": "license", "hardware": "hardware",
};
const LEVEL_MAP: Record<string, string> = {
  "internship": "internship", "entry level": "entry_level", "junior": "junior",
  "middle": "middle", "senior": "senior", "lead": "lead", "manager": "manager", "vp": "vp",
};
const OPTY_STATUS_MAP: Record<string, string> = {
  "project on hold": "on_hold", "client not responding": "client_not_responding",
  "lost on pitching period": "lost_pitching", "waiting for feedback": "waiting_feedback",
  "client budget on hold": "budget_on_hold", "project won": "won",
  "closed lost": "closed_lost", "opty on going others": "on_going_others",
};
const PRIORITY_MAP: Record<string, string> = { "p0": "p0", "p1": "p1", "p2": "p2", "p3": "p3" };

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
  revalidatePath("/ta/sheet-sync");
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
  revalidatePath("/ta/sheet-sync");
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
      const clientName = cell(row, "client_name");
      const positionName = cell(row, "position_name");
      const taPic = cell(row, "ta_pic_name");
      if (!clientName || !positionName || !taPic) { skipped++; continue; }

      const headcountRaw = cell(row, "headcount_target");
      const headcountNum = Number(headcountRaw);
      const priceRaw = cell(row, "price_amount");
      const priceNum = Number(priceRaw);

      const values = {
        opty_request_date: cell(row, "opty_request_date") || null,
        client_name: clientName,
        position_name: positionName,
        service_type_code: normalizeValue(cell(row, "service_type_code"), SERVICE_TYPE_MAP) || null,
        level_code: normalizeValue(cell(row, "level_code"), LEVEL_MAP) || null,
        opty_status_code: normalizeValue(cell(row, "opty_status_code"), OPTY_STATUS_MAP) || null,
        headcount_target: headcountRaw && !isNaN(headcountNum) ? headcountNum : 1,
        priority_code: normalizeValue(cell(row, "priority_code"), PRIORITY_MAP) || "p2",
        price_amount: priceRaw && !isNaN(priceNum) ? priceNum : null,
        ta_pic_name: taPic,
        notes: cell(row, "notes") || null,
      };

      // Kalau sheet punya kolom Requisition No, dicocokkan dari situ (paling akurat).
      // Kalau belum ada (sheet lama), fallback ke kombinasi Client Name + Positions.
      const requisitionNoFromSheet = cell(row, "requisition_no") || null;
      const existingReq = requisitionNoFromSheet
        ? await db.select().from(requisitions).where(eq(requisitions.requisition_no, requisitionNoFromSheet))
        : await db.select().from(requisitions)
            .where(and(eq(requisitions.client_name, clientName), eq(requisitions.position_name, positionName)));

      if (existingReq.length > 0) {
        await db.update(requisitions).set(values).where(eq(requisitions.id, existingReq[0].id));
      } else {
        await db.insert(requisitions).values({ ...values, requisition_no: requisitionNoFromSheet || await generateRequisitionNo() });
      }
      imported++;
    }

    revalidatePath("/ta");
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
    const allReqs = await db.select().from(requisitions);

    const rows: string[][] = [HEADERS];
    for (const r of allReqs) {
      rows.push([
        r.requisition_no, r.opty_request_date ?? "", r.client_name, r.position_name, r.service_type_code ?? "",
        r.level_code ?? "", r.opty_status_code ?? "", r.headcount_target?.toString() ?? "",
        r.priority_code, r.price_amount?.toString() ?? "", r.ta_pic_name, r.notes ?? "",
      ]);
    }

    const quotedSheetName = quoteSheetName(connection.sheet_name);
    const range = `${quotedSheetName}!A1:L${rows.length}`;
    await clearSheetRange(accessToken, connection.spreadsheet_id, `${quotedSheetName}!A:L`);
    await writeSheetValues(accessToken, connection.spreadsheet_id, range, rows);

    return { ok: true, imported: allReqs.length, skipped: 0 };
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
