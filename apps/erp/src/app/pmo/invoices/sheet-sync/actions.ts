"use server";
import { integrationDisabled } from "@/lib/integration-policy";
import { db } from "@/db";
import { projectInvoices, opportunities, sheetConnections } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getValidAccessToken, extractSpreadsheetId, readSheetValues, writeSheetValues, clearSheetRange, quoteSheetName } from "@/lib/google-sheets";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";

const DIVISION_KEY = "pmo_invoices";

const HEADERS = [
  "Opty No", "Invoice Plan Date", "Grup", "Services Month Start", "Price / Month", "Status", "Link BAST & Support", "Notes",
];

const STATUS_MAP: Record<string, string> = {
  "overdue": "overdue", "submitted": "submitted", "planned": "planned", "invoice plan": "planned",
  "canceled": "canceled", "cancelled": "canceled",
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
  revalidatePath("/pmo/invoices/sheet-sync");
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
  revalidatePath("/pmo/invoices/sheet-sync");
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
      const optyNo = cell(row, "opty_no");
      if (!optyNo) { skipped++; continue; }

      const [opty] = await db.select().from(opportunities).where(eq(opportunities.opty_no, optyNo));
      if (!opty) { skipped++; continue; }

      const priceRaw = cell(row, "price_per_month");
      const priceNum = Number(priceRaw);

      const servicesMonthStart = cell(row, "services_month_start") || null;
      const values = {
        opportunity_id: opty.id,
        invoice_plan_date: cell(row, "invoice_plan_date") || null,
        group_name: cell(row, "group_name") || null,
        services_month_start: servicesMonthStart,
        price_per_month: priceRaw && !isNaN(priceNum) ? priceNum : null,
        status_code: normalizeValue(cell(row, "status_code"), STATUS_MAP) || null,
        bast_support_doc_url: cell(row, "bast_support_doc_url") || null,
        notes: cell(row, "notes") || null,
      };

      // Satu Opportunity bisa punya beberapa invoice bulanan, jadi dicocokkan
      // dari Opportunity + Services Month Start -- update kalau sudah ada,
      // insert kalau belum, biar nggak dobel tiap kali pull.
      const existingInvoice = servicesMonthStart
        ? await db.select().from(projectInvoices)
            .where(and(eq(projectInvoices.opportunity_id, opty.id), eq(projectInvoices.services_month_start, servicesMonthStart)))
        : [];
      if (existingInvoice.length > 0) {
        await db.update(projectInvoices).set(values).where(eq(projectInvoices.id, existingInvoice[0].id));
      } else {
        await db.insert(projectInvoices).values(values);
      }
      imported++;
    }

    revalidatePath("/pmo/invoices");
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
    const allInvoices = await db
      .select({
        opty_no: opportunities.opty_no,
        invoice_plan_date: projectInvoices.invoice_plan_date,
        group_name: projectInvoices.group_name,
        services_month_start: projectInvoices.services_month_start,
        price_per_month: projectInvoices.price_per_month,
        status_code: projectInvoices.status_code,
        bast_support_doc_url: projectInvoices.bast_support_doc_url,
        notes: projectInvoices.notes,
      })
      .from(projectInvoices)
      .leftJoin(opportunities, eq(projectInvoices.opportunity_id, opportunities.id));

    const rows: string[][] = [HEADERS];
    for (const inv of allInvoices) {
      rows.push([
        inv.opty_no ?? "", inv.invoice_plan_date ?? "", inv.group_name ?? "", inv.services_month_start ?? "",
        inv.price_per_month?.toString() ?? "", inv.status_code ?? "", inv.bast_support_doc_url ?? "", inv.notes ?? "",
      ]);
    }

    const quotedSheetName = quoteSheetName(connection.sheet_name);
    const range = `${quotedSheetName}!A1:H${rows.length}`;
    await clearSheetRange(accessToken, connection.spreadsheet_id, `${quotedSheetName}!A:H`);
    await writeSheetValues(accessToken, connection.spreadsheet_id, range, rows);

    return { ok: true, imported: allInvoices.length, skipped: 0 };
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
