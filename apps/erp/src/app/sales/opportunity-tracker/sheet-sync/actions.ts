"use server";
import { integrationDisabled } from "@/lib/integration-policy";
import { db } from "@/db";
import { salesOpportunityTrackers, sheetConnections } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getValidAccessToken, extractSpreadsheetId, readSheetValues, writeSheetValues, clearSheetRange, quoteSheetName } from "@/lib/google-sheets";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

const DIVISION_KEY = "sales_opportunity_tracker";

const HEADERS = [
  "Opty No", "Sales Qualified", "Client Name", "Service Type", "Requirement Summary", "Opty Status",
  "Progress Notes", "Estimated Deal", "Detail Requirement", "Client Type", "Sales PIC",
  "Last Communication", "BANTE Score", "Dropped Reason", "Positions", "Level", "Headcount", "Price",
];

const OPTY_STATUS_MAP: Record<string, string> = {
  "cv submission": "cv_submission", "solutioning": "solutioning",
  "proposal sent": "proposal_sent", "win": "win", "dropped": "dropped",
};
const CLIENT_TYPE_MAP: Record<string, string> = { "existing": "existing", "new": "new" };
const SERVICE_TYPE_MAP: Record<string, string> = {
  "outsourcing": "outsourcing", "headhunting": "headhunting", "outplacement": "outplacement",
  "manage service": "managed_service", "managed service": "managed_service", "project based": "project_based",
  "rpo": "rpo", "training": "training", "license": "license", "hardware": "hardware",
};
const LEVEL_MAP: Record<string, string> = {
  "internship": "internship", "entry level": "entry_level", "junior": "junior",
  "middle": "middle", "senior": "senior", "lead": "lead", "manager": "manager", "vp": "vp",
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
  revalidatePath("/sales/opportunity-tracker/sheet-sync");
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
  revalidatePath("/sales/opportunity-tracker/sheet-sync");
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
      const salesPic = cell(row, "sales_pic_name");
      if (!clientName || !salesPic) { skipped++; continue; }

      const optyNoFromSheet = cell(row, "opty_no");
      const existing = optyNoFromSheet ? await db.select().from(salesOpportunityTrackers).where(eq(salesOpportunityTrackers.opty_no, optyNoFromSheet)) : [];

      const qualifiedRaw = cell(row, "sales_qualified").toLowerCase();
      const sales_qualified = qualifiedRaw.includes("true") || qualifiedRaw.includes("yes") || qualifiedRaw.includes("ya");

      const headcountRaw = cell(row, "headcount_target");
      const headcountNum = Number(headcountRaw);
      const priceRaw = cell(row, "price_amount");
      const priceNum = Number(priceRaw);
      const dealRaw = cell(row, "estimated_deal_amount");
      const dealNum = Number(dealRaw);
      const banteRaw = cell(row, "bante_score");
      const banteNum = Number(banteRaw);

      const values = {
        opty_no: optyNoFromSheet || `OPTY-IMPORT-${Date.now()}-${imported}`,
        sales_qualified,
        client_name: clientName,
        service_type_code: normalizeValue(cell(row, "service_type_code"), SERVICE_TYPE_MAP) || null,
        requirement_summary: cell(row, "requirement_summary") || null,
        opty_status_code: normalizeValue(cell(row, "opty_status_code"), OPTY_STATUS_MAP) || "cv_submission",
        progress_notes: cell(row, "progress_notes") || null,
        estimated_deal_amount: dealRaw && !isNaN(dealNum) ? dealNum : null,
        detail_requirement: cell(row, "detail_requirement") || null,
        client_type_code: normalizeValue(cell(row, "client_type_code"), CLIENT_TYPE_MAP) || null,
        sales_pic_name: salesPic,
        last_communication_date: cell(row, "last_communication_date") || null,
        bante_score: banteRaw && !isNaN(banteNum) ? banteNum : null,
        dropped_reason: cell(row, "dropped_reason") || null,
        position_name: cell(row, "position_name") || null,
        level_code: normalizeValue(cell(row, "level_code"), LEVEL_MAP) || null,
        headcount_target: headcountRaw && !isNaN(headcountNum) ? headcountNum : null,
        price_amount: priceRaw && !isNaN(priceNum) ? priceNum : null,
      };

      if (existing.length > 0) {
        await db.update(salesOpportunityTrackers).set(values).where(eq(salesOpportunityTrackers.id, existing[0].id));
      } else {
        await db.insert(salesOpportunityTrackers).values(values);
      }
      imported++;
    }

    revalidatePath("/sales/opportunity-tracker");
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
    const allTrackers = await db.select().from(salesOpportunityTrackers);

    const rows: string[][] = [HEADERS];
    for (const t of allTrackers) {
      rows.push([
        t.opty_no, t.sales_qualified ? "Yes" : "No", t.client_name, t.service_type_code ?? "",
        t.requirement_summary ?? "", t.opty_status_code, t.progress_notes ?? "",
        t.estimated_deal_amount?.toString() ?? "", t.detail_requirement ?? "", t.client_type_code ?? "",
        t.sales_pic_name, t.last_communication_date ?? "", t.bante_score?.toString() ?? "",
        t.dropped_reason ?? "", t.position_name ?? "", t.level_code ?? "",
        t.headcount_target?.toString() ?? "", t.price_amount?.toString() ?? "",
      ]);
    }

    const quotedSheetName = quoteSheetName(connection.sheet_name);
    const range = `${quotedSheetName}!A1:R${rows.length}`;
    await clearSheetRange(accessToken, connection.spreadsheet_id, `${quotedSheetName}!A:R`);
    await writeSheetValues(accessToken, connection.spreadsheet_id, range, rows);

    return { ok: true, imported: allTrackers.length, skipped: 0 };
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
