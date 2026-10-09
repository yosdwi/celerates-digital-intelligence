"use server";
import { requireSalesSheetSync } from "@/lib/integration-policy";
import { requireActor } from "@/lib/actor";
import { db } from "@/db";
import { sheetConnections } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSheetsToken, extractSpreadsheetId, readSheetValues, quoteSheetName } from "@/lib/google-sheets";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

const DIVISION_KEY = "sales_opportunity_tracker";

export async function connectSheet(formData: FormData) {
  await requireActor();
  await requireSalesSheetSync();

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
  await requireActor();
  await requireSalesSheetSync();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return { ok: false, error: "Belum login" };

  const [connection] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, DIVISION_KEY));
  if (!connection) return { ok: false, error: "Belum ada Google Sheet yang terhubung" };

  try {
    const accessToken = await getSheetsToken();
    const rows = await readSheetValues(accessToken, connection.spreadsheet_id, `${quoteSheetName(connection.sheet_name)}!A1:Z1`);
    const headers = (rows[0] ?? []).filter((h) => h.trim() !== "");
    if (headers.length === 0) return { ok: false, error: "Baris header (baris 1) di sheet kosong." };
    return { ok: true, headers };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal baca header" };
  }
}

export async function saveColumnMapping(mapping: Record<string, string>): Promise<void> {
  await requireActor();
  await requireSalesSheetSync();

  await db.update(sheetConnections).set({ column_mapping: JSON.stringify(mapping) }).where(eq(sheetConnections.division_key, DIVISION_KEY));
  revalidatePath("/sales/opportunity-tracker/sheet-sync");
}

export type SyncResult = { ok: true; imported: number; skipped: number } | { ok: false; error: string };

// V1's pull and push were replaced by the Sales V2 import (preview, value mapping, per-row errors, history) and a
// push that only changes mapped cells (features/sales-v2/sheet-import-actions.ts, QA 2026-10-09). The old push
// cleared the whole tab; neither path runs any more.
const MOVED = "Sync sekarang lewat Sales V2: buka Google Sheet Sync di halaman V2 untuk melihat preview sebelum import.";

export async function syncPull(): Promise<SyncResult> {
  await requireActor();
  await requireSalesSheetSync();
  return { ok: false, error: MOVED };
}

export async function syncPush(): Promise<SyncResult> {
  await requireActor();
  await requireSalesSheetSync();
  return { ok: false, error: MOVED };
}

export type DebugResult = {
  ok: true;
  savedMapping: Record<string, string>;
  headerRow: string[];
  detectedColumns: Record<string, number>;
  sampleRows: Record<string, string>[];
} | { ok: false; error: string };

export async function debugSync(): Promise<DebugResult> {
  await requireActor();
  await requireSalesSheetSync();

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
    const accessToken = await getSheetsToken();
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
