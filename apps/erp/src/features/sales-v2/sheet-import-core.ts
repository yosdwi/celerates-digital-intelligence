// The Sheet import's server side without a request (sheet-import-actions.ts is the person's door to it; a scheduled
// workflow is the other, lib/workflows). Reads the sheet and the database, recomputes the plan, commits.
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { opportunities, recordFieldChanges, salesOpportunityTrackers, sheetConnections } from "@/db/schema";
import { generateOptyNo, generateOptyNoWithPosition } from "@/lib/id-generators";
import { getSheetsToken, readSheetGrid } from "@/lib/google-sheets";
import { loadSalesPics } from "./data";
import {
  SHEET_FIELDS, matchColumns, planImport, readConfig, uniqueHeaders,
  type ColumnMatch, type DateOrder, type Existing, type ImportConfig, type SheetKind, type ValueMaps,
} from "./sheet-import";

export type ImportOverride = { columns?: Record<string, string>; values?: ValueMaps; dateOrder?: DateOrder };
export type ImportResult = { ok: true; tab: string; created: number; updated: number; same: number; skipped: number; failed: { row: number; issues: string[] }[] } | { ok: false; error: string };

const DIVISION: Record<SheetKind, string> = { ot: "sales_opportunity_tracker", pq: "sales" };
const MAX_ROWS = 5000;

export const isKind = (k: unknown): k is SheetKind => k === "ot" || k === "pq";

export async function connection(kind: SheetKind) {
  const [c] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, DIVISION[kind]));
  if (!c) throw new Error("Belum ada Google Sheet yang terhubung.");
  return c;
}

export async function readTab(spreadsheetId: string, tab: string) {
  const token = await getSheetsToken();
  const [raw, shown] = await Promise.all([readSheetGrid(token, spreadsheetId, tab, "UNFORMATTED_VALUE"), readSheetGrid(token, spreadsheetId, tab, "FORMATTED_VALUE")]);
  if (!raw.length) throw new Error(`Tab "${tab}" kosong.`);
  const headers = uniqueHeaders(raw[0]);
  let rows = raw.slice(1, MAX_ROWS + 1);
  while (rows.length && rows[rows.length - 1].every((v) => v == null || v === "")) rows = rows.slice(0, -1);
  // Up to three examples per column, as the sheet shows them, for choosing the mapping.
  const samples = headers.map((_, i) => shown.slice(1).map((r) => String(r[i] ?? "").trim()).filter(Boolean).slice(0, 3));
  return { token, headers, rows, samples, truncated: raw.length - 1 > MAX_ROWS };
}

export async function existing(kind: SheetKind): Promise<Existing[]> {
  const rows = kind === "ot" ? await db.select().from(salesOpportunityTrackers) : await db.select().from(opportunities);
  return rows.map((r) => ({ id: r.id, key: r.opty_no, values: r as unknown as Record<string, unknown> }));
}

/** Decides the config: the person's choices from this request, else what is saved, else the automatic match. */
export async function prepare(kind: SheetKind, override?: ImportOverride) {
  const c = await connection(kind);
  const saved = readConfig(c.column_mapping, c.sheet_name);
  const sheet = await readTab(c.spreadsheet_id, c.sheet_name);
  const fields = SHEET_FIELDS[kind];
  const matches: Record<string, ColumnMatch | null> = matchColumns(sheet.headers, fields, override?.columns ?? saved.columns);
  const columns = Object.fromEntries(sheet.headers.map((h) => [h, matches[h]?.field ?? ""]));
  const config: ImportConfig = {
    v: 2, tab: c.sheet_name, columns,
    values: { ...saved.values, ...Object.fromEntries(Object.entries(override?.values ?? {}).map(([f, m]) => [f, { ...saved.values[f], ...m }])) },
    dateOrder: override?.dateOrder ?? saved.dateOrder,
  };
  if (override) await db.update(sheetConnections).set({ column_mapping: JSON.stringify(config) }).where(eq(sheetConnections.id, c.id));
  return { c, sheet, matches, config };
}

export const clip = (s: string | null, n = 120) => (s && s.length > n ? `${s.slice(0, n)}…` : s);


/** Imports the rows the plan marks create or update, in one transaction, as `by` (recorded in the history). */
export async function runImportCommit(kind: SheetKind, by: { id: string | null; name: string }, override?: ImportOverride): Promise<ImportResult> {
  try {
    const { c, sheet, config } = await prepare(kind, override);
    const current = await existing(kind);
    const plan = planImport({ kind, headers: sheet.headers, rows: sheet.rows, columns: config.columns, values: config.values, dateOrder: config.dateOrder, existing: current, pics: await loadSalesPics() });
    if (plan.missingRequired.length && plan.summary.create) return { ok: false, error: `Petakan kolom wajib dulu: ${plan.missingRequired.join(", ")}.` };
    const byKey = new Map(current.map((e) => [e.key.trim().toLowerCase(), e]));
    const actor = { actor_user_id: by.id, actor_name: by.name };

    // New numbers are drawn before the transaction (the generators read the tables themselves).
    const creates = await Promise.all(plan.rows.filter((r) => r.status === "create").map(async (r) => {
      const v = { ...r.values };
      if (kind === "ot") return { ...v, opty_no: r.key ?? (await generateOptyNo()), sales_qualified: v.sales_qualified ?? false, opty_status_code: v.opty_status_code ?? "cv_submission" };
      return { ...v, opty_no: r.key ?? (await generateOptyNoWithPosition(String(v.client_name), String(v.position_name ?? ""), String(v.business_unit_code ?? ""))), pipeline_stage_code: v.pipeline_stage_code ?? "on_going" };
    }));
    const trackers = kind === "pq" && creates.length
      ? await db.select({ id: salesOpportunityTrackers.id, opty_no: salesOpportunityTrackers.opty_no }).from(salesOpportunityTrackers).where(inArray(salesOpportunityTrackers.opty_no, creates.map((x) => String(x.opty_no))))
      : [];
    const linked = new Set(current.map((e) => String(e.values.opportunity_tracker_id ?? "")).filter(Boolean));

    await db.transaction(async (tx) => {
      for (const v of creates) {
        if (kind === "ot") await tx.insert(salesOpportunityTrackers).values(v as typeof salesOpportunityTrackers.$inferInsert);
        else {
          // A PQ whose ID Opty is an Opportunity's number continues that Opportunity, as Convert would.
          const t = trackers.find((x) => x.opty_no === v.opty_no && !linked.has(x.id));
          if (t) linked.add(t.id);
          await tx.insert(opportunities).values({ ...v, opportunity_tracker_id: t?.id ?? null } as typeof opportunities.$inferInsert);
        }
      }
      for (const r of plan.rows.filter((x) => x.status === "update")) {
        const target = byKey.get(String(r.key).trim().toLowerCase())!;
        const changes = Object.fromEntries(r.changes.map((x) => [x.field, r.values[x.field]]));
        if (kind === "ot") await tx.update(salesOpportunityTrackers).set(changes).where(eq(salesOpportunityTrackers.id, target.id));
        else await tx.update(opportunities).set(changes).where(eq(opportunities.id, target.id));
        await tx.insert(recordFieldChanges).values(r.changes.map((x) => ({
          record_type: kind === "ot" ? "opportunity_tracker" : "commercial_pq", record_id: target.id, field: x.field, old_value: x.old, new_value: x.new, ...actor,
        })));
      }
    });
    const s = plan.summary;
    return { ok: true, tab: c.sheet_name, created: s.create, updated: s.update, same: s.same, skipped: s.skip, failed: plan.rows.filter((r) => r.status === "error").map((r) => ({ row: r.row, issues: r.issues })) };
  } catch (e) {
    return { ok: false, error: `Import dibatalkan, tidak ada yang tersimpan. ${e instanceof Error ? e.message.slice(0, 200) : ""}` };
  }
}
