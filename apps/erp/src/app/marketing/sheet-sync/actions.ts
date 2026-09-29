"use server";
import { integrationDisabled } from "@/lib/integration-policy";
import { db } from "@/db";
import { leads, sheetConnections } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getValidAccessToken, extractSpreadsheetId, readSheetValues, writeSheetValues, clearSheetRange, quoteSheetName } from "@/lib/google-sheets";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { generateLeadNo } from "@/app/marketing/actions";

const DIVISION_KEY = "marketing";

const LEAD_SOURCE_MAP: Record<string, string> = { "linkedln": "linkedin", "linkedin": "linkedin", "ads": "ads", "referral": "referral", "existing": "existing", "website": "website" };
const SERVICE_TYPE_MAP: Record<string, string> = {
  "outsourcing": "outsourcing", "headhunting": "headhunting", "outplacement": "outplacement",
  "manage service": "managed_service", "managed service": "managed_service", "project based": "project_based",
  "rpo": "rpo", "training": "training", "license": "license", "hardware": "hardware",
  "corporate training": "corporate_training", "software development": "software_development",
};
const CATEGORY_MAP: Record<string, string> = { "it": "it", "non it": "non_it", "non-it": "non_it" };

const LEAD_SOURCE_LABELS: Record<string, string> = { linkedin: "Linkedln", ads: "Ads", referral: "Referral", existing: "Existing", website: "Website" };
const SERVICE_TYPE_LABELS: Record<string, string> = {
  outsourcing: "Outsourcing", headhunting: "Headhunting", outplacement: "Outplacement",
  managed_service: "Manage Service", project_based: "Project Based", rpo: "RPO",
  training: "Training", license: "License", hardware: "Hardware",
  corporate_training: "Corporate Training", software_development: "Software Development",
};
const CATEGORY_LABELS: Record<string, string> = { it: "IT", non_it: "Non IT" };

function normalizeValue(value: string, map: Record<string, string>): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const key = trimmed.toLowerCase();
    if (map[key]) return map[key];
    // Nggak ketemu di daftar resmi -- simpan apa adanya (disederhanakan jadi kode),
    // biar data tetap masuk, bukan di-skip. Bisa dirapihkan manual belakangan.
    return key.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

export async function connectSheet(formData: FormData) {
  await integrationDisabled();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) throw new Error("Belum login");

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

  revalidatePath("/marketing/sheet-sync");
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
  revalidatePath("/marketing/sheet-sync");
}

export type SyncResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; error: string };

export async function syncPull(): Promise<SyncResult> {
  await integrationDisabled();

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return { ok: false, error: "Belum login" };

  const [connection] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, DIVISION_KEY));
  if (!connection) return { ok: false, error: "Belum ada Google Sheet yang terhubung" };
  if (!connection.column_mapping) return { ok: false, error: "Belum ada pemetaan kolom. Lengkapi dulu di bagian 'Petakan Kolom'." };

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
      if (!clientName) { skipped++; continue; }

      const lead_source_code = normalizeValue(cell(row, "lead_source_code"), LEAD_SOURCE_MAP);
      const service_type_code = normalizeValue(cell(row, "service_type_code"), SERVICE_TYPE_MAP);
      const category_code = normalizeValue(cell(row, "category_code"), CATEGORY_MAP);

      if (!lead_source_code || !service_type_code || !category_code) { skipped++; continue; }

      const qualifiedRaw = cell(row, "is_qualified").toLowerCase();
      const is_qualified = qualifiedRaw.includes("true") || qualifiedRaw.includes("yes") ? true
        : qualifiedRaw.includes("false") || qualifiedRaw.includes("no") ? false
        : null;

      const leadNo = cell(row, "lead_no");
      const existingLead = leadNo ? await db.select().from(leads).where(eq(leads.lead_no, leadNo)) : [];

      const values = {
        lead_no: leadNo || await generateLeadNo(clientName, lead_source_code),
        lead_source_code,
        client_name: clientName,
        contact_name: cell(row, "contact_name") || "-",
        company_size: (() => {
            const raw = cell(row, "company_size");
            const num = Number(raw);
            return raw && !isNaN(num) ? num : null;
          })(),
        industry_code: cell(row, "industry_code") || null,
        contact_email: cell(row, "contact_email") || null,
        contact_phone: cell(row, "contact_phone") || null,
        service_type_code,
        category_code,
        notes: cell(row, "notes") || null,
        sales_pic_name: cell(row, "sales_pic_name") || "-",
        is_qualified,
        disqualify_reason: cell(row, "disqualify_reason") || null,
      };

      if (existingLead.length > 0) {
        await db.update(leads).set(values).where(eq(leads.id, existingLead[0].id));
      } else {
        await db.insert(leads).values(values);
      }
      imported++;
    }

    revalidatePath("/marketing");
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
    const allLeads = await db.select().from(leads);

    const HEADERS = [
      "Leads ID", "Lead source", "Client Name", "Contact Name", "Company Size", "Industry",
      "Email", "Phone", "Service Type", "Category", "Detail", "Sales PIC", "Qualified By MKT", "Notes (If No, Give a reason)",
    ];

    const rows: string[][] = [HEADERS];
    for (const lead of allLeads) {
      rows.push([
        lead.lead_no,
        LEAD_SOURCE_LABELS[lead.lead_source_code] ?? lead.lead_source_code,
        lead.client_name,
        lead.contact_name,
        lead.company_size?.toString() ?? "",
        lead.industry_code ?? "",
        lead.contact_email ?? "",
        lead.contact_phone ?? "",
        SERVICE_TYPE_LABELS[lead.service_type_code] ?? lead.service_type_code,
        CATEGORY_LABELS[lead.category_code] ?? lead.category_code,
        lead.notes ?? "",
        lead.sales_pic_name,
        lead.is_qualified === true ? "True (Yes)" : lead.is_qualified === false ? "False (No)" : "",
        lead.disqualify_reason ?? "",
      ]);
    }

    const quotedSheetName = quoteSheetName(connection.sheet_name);
    const range = `${quotedSheetName}!A1:N${rows.length}`;
    await clearSheetRange(accessToken, connection.spreadsheet_id, `${quotedSheetName}!A:N`);
    await writeSheetValues(accessToken, connection.spreadsheet_id, range, rows);

    return { ok: true, imported: allLeads.length, skipped: 0 };
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