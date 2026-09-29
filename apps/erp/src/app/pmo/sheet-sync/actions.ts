"use server";
import { integrationDisabled } from "@/lib/integration-policy";
import { db } from "@/db";
import { projectDocuments, opportunities, sheetConnections } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getValidAccessToken, extractSpreadsheetId, readSheetValues, writeSheetValues, clearSheetRange, quoteSheetName } from "@/lib/google-sheets";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

const DIVISION_KEY = "pmo_document_tracker";

const HEADERS = [
  "Opty No", "Project Details", "Sales Type", "PQ Price", "PQ Total",
  "No PKS", "Link PKS", "Status PKS", "Start Date PO", "End Date PO", "No PO", "Link PO", "Status PO",
  "No CR", "Link CR", "Status CR", "No Dokumen Lain", "Link Dokumen Lain", "Status Dokumen Lain",
];

const SALES_TYPE_MAP: Record<string, string> = {
  "farming": "farming", "new closing": "new_closing", "overtime": "overtime",
  "business trip": "business_trip", "other": "other", "medical": "medical",
};
const DOC_STATUS_MAP: Record<string, string> = {
  "done softcopy": "done_softcopy", "done hardcopy": "done_hardcopy", "on progress": "on_progress",
  "need fu hardcopy": "need_fu_hardcopy", "need fu softcopy": "need_fu_softcopy", "none": "none",
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
  revalidatePath("/pmo/sheet-sync");
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
  revalidatePath("/pmo/sheet-sync");
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

      const pqPriceRaw = cell(row, "pq_price");
      const pqPriceNum = Number(pqPriceRaw);
      const pqTotalRaw = cell(row, "pq_total");
      const pqTotalNum = Number(pqTotalRaw);

      const values = {
        opportunity_id: opty.id,
        project_details: cell(row, "project_details") || null,
        sales_type_code: normalizeValue(cell(row, "sales_type_code"), SALES_TYPE_MAP) || null,
        pq_price: pqPriceRaw && !isNaN(pqPriceNum) ? pqPriceNum : null,
        pq_total: pqTotalRaw && !isNaN(pqTotalNum) ? pqTotalNum : null,
        pks_no: cell(row, "pks_no") || null,
        pks_url: cell(row, "pks_url") || null,
        pks_status_code: normalizeValue(cell(row, "pks_status_code"), DOC_STATUS_MAP) || null,
        po_start_date: cell(row, "po_start_date") || null,
        po_end_date: cell(row, "po_end_date") || null,
        po_no: cell(row, "po_no") || null,
        po_url: cell(row, "po_url") || null,
        po_status_code: normalizeValue(cell(row, "po_status_code"), DOC_STATUS_MAP) || null,
        cr_no: cell(row, "cr_no") || null,
        cr_url: cell(row, "cr_url") || null,
        cr_status_code: normalizeValue(cell(row, "cr_status_code"), DOC_STATUS_MAP) || null,
        other_doc_no: cell(row, "other_doc_no") || null,
        other_doc_url: cell(row, "other_doc_url") || null,
        other_doc_status_code: normalizeValue(cell(row, "other_doc_status_code"), DOC_STATUS_MAP) || null,
      };

      // Satu Opportunity = satu baris Document Tracker -- update kalau sudah
      // ada, insert kalau belum, biar nggak dobel tiap kali pull.
      const [existingDoc] = await db.select().from(projectDocuments).where(eq(projectDocuments.opportunity_id, opty.id));
      if (existingDoc) {
        await db.update(projectDocuments).set(values).where(eq(projectDocuments.id, existingDoc.id));
      } else {
        await db.insert(projectDocuments).values(values);
      }
      imported++;
    }

    revalidatePath("/pmo");
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
    const allDocs = await db
      .select({
        opty_no: opportunities.opty_no,
        project_details: projectDocuments.project_details,
        sales_type_code: projectDocuments.sales_type_code,
        pq_price: projectDocuments.pq_price,
        pq_total: projectDocuments.pq_total,
        pks_no: projectDocuments.pks_no,
        pks_url: projectDocuments.pks_url,
        pks_status_code: projectDocuments.pks_status_code,
        po_start_date: projectDocuments.po_start_date,
        po_end_date: projectDocuments.po_end_date,
        po_no: projectDocuments.po_no,
        po_url: projectDocuments.po_url,
        po_status_code: projectDocuments.po_status_code,
        cr_no: projectDocuments.cr_no,
        cr_url: projectDocuments.cr_url,
        cr_status_code: projectDocuments.cr_status_code,
        other_doc_no: projectDocuments.other_doc_no,
        other_doc_url: projectDocuments.other_doc_url,
        other_doc_status_code: projectDocuments.other_doc_status_code,
      })
      .from(projectDocuments)
      .leftJoin(opportunities, eq(projectDocuments.opportunity_id, opportunities.id));

    const rows: string[][] = [HEADERS];
    for (const d of allDocs) {
      rows.push([
        d.opty_no ?? "", d.project_details ?? "", d.sales_type_code ?? "", d.pq_price?.toString() ?? "", d.pq_total?.toString() ?? "",
        d.pks_no ?? "", d.pks_url ?? "", d.pks_status_code ?? "", d.po_start_date ?? "", d.po_end_date ?? "",
        d.po_no ?? "", d.po_url ?? "", d.po_status_code ?? "", d.cr_no ?? "", d.cr_url ?? "", d.cr_status_code ?? "",
        d.other_doc_no ?? "", d.other_doc_url ?? "", d.other_doc_status_code ?? "",
      ]);
    }

    const quotedSheetName = quoteSheetName(connection.sheet_name);
    const range = `${quotedSheetName}!A1:S${rows.length}`;
    await clearSheetRange(accessToken, connection.spreadsheet_id, `${quotedSheetName}!A:S`);
    await writeSheetValues(accessToken, connection.spreadsheet_id, range, rows);

    return { ok: true, imported: allDocs.length, skipped: 0 };
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
