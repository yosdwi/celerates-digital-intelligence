"use server";
// Google Sheet import and push for Sales V2 (QA 2026-10-09, docs/design/SALES-SHEET-SYNC-STRESS-TEST.md §5). The sheet
// and the database are read here; every decision is made by the pure plan (sheet-import.ts), recomputed on the
// server for each commit, so nothing the browser sends is written without being checked again. Same guard as V1:
// Sales editors import; pushing to the team's sheet needs Sales Full or Owner.
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { db } from "@/db";
import { opportunities, recordFieldChanges, salesOpportunityTrackers, sheetConnections } from "@/db/schema";
import { authOptions } from "@/lib/auth";
import { requireActor } from "@/lib/actor";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { requireSalesSheetSync } from "@/lib/integration-policy";
import { logActivity } from "@/lib/activity-log";
import { generateOptyNo, generateOptyNoWithPosition } from "@/lib/id-generators";
import { appendSheetRows, getSheetsToken, quoteSheetName, readSheetGrid, writeSheetCells } from "@/lib/google-sheets";
import { agentActor, agentEnabled, delegate, intelligenceBase } from "@/lib/agent/bff";
import { loadSalesPics } from "./data";
import {
  SHEET_FIELDS, columnLetter, matchColumns, planImport, planPush, readConfig, uniqueHeaders,
  type ColumnMatch, type DateOrder, type Existing, type ImportConfig, type ImportPlan, type SheetKind, type ValueMaps,
} from "./sheet-import";

const DIVISION: Record<SheetKind, string> = { ot: "sales_opportunity_tracker", pq: "sales" };
const MAX_ROWS = 5000;
export type ImportOverride = { columns?: Record<string, string>; values?: ValueMaps; dateOrder?: DateOrder };

const isKind = (k: unknown): k is SheetKind => k === "ot" || k === "pq";

async function connection(kind: SheetKind) {
  const [c] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, DIVISION[kind]));
  if (!c) throw new Error("Belum ada Google Sheet yang terhubung.");
  return c;
}

async function readTab(spreadsheetId: string, tab: string) {
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

async function existing(kind: SheetKind): Promise<Existing[]> {
  const rows = kind === "ot" ? await db.select().from(salesOpportunityTrackers) : await db.select().from(opportunities);
  return rows.map((r) => ({ id: r.id, key: r.opty_no, values: r as unknown as Record<string, unknown> }));
}

/** Decides the config: the person's choices from this request, else what is saved, else the automatic match. */
async function prepare(kind: SheetKind, override?: ImportOverride) {
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

const clip = (s: string | null, n = 120) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

export type ImportPreview = {
  ok: true; tab: string; url: string; headers: string[]; samples: string[][]; matches: Record<string, ColumnMatch | null>;
  dateOrder: DateOrder; truncated: boolean; plan: ImportPlan; fields: { key: string; label: string; required: boolean }[]; ai: boolean;
  options: Record<string, { value: string; label: string }[]>;
} | { ok: false; error: string };

export async function importPreview(kind: SheetKind, override?: ImportOverride): Promise<ImportPreview> {
  await requireActor();
  await requireSalesSheetSync();
  if (!isKind(kind)) return { ok: false, error: "Jenis sheet tidak dikenal." };
  try {
    const { c, sheet, matches, config } = await prepare(kind, override);
    const pics = await loadSalesPics();
    const plan = planImport({ kind, headers: sheet.headers, rows: sheet.rows, columns: config.columns, values: config.values, dateOrder: config.dateOrder, existing: await existing(kind), pics });
    const fields = SHEET_FIELDS[kind];
    const options = Object.fromEntries(fields.filter((f) => f.options || f.type === "pic").map((f) => [f.key,
      f.type === "pic" ? pics.map((p) => ({ value: p, label: p })) : (f.options ?? []).map(([value, label]) => ({ value, label }))]));
    return {
      ok: true, tab: c.sheet_name, url: c.spreadsheet_url, headers: sheet.headers, samples: sheet.samples, matches, dateOrder: config.dateOrder, truncated: sheet.truncated,
      plan: { ...plan, rows: plan.rows.map((r) => ({ ...r, values: {}, changes: r.changes.map((x) => ({ ...x, old: clip(x.old), new: clip(x.new) })) })) },
      fields: fields.map((f) => ({ key: f.key, label: f.label, required: !!f.required })), ai: agentEnabled(), options,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal membaca Google Sheet." };
  }
}

export type ImportResult = { ok: true; created: number; updated: number; same: number; skipped: number; failed: { row: number; issues: string[] }[] } | { ok: false; error: string };

/** Imports the rows the preview marked create or update, in one transaction; error rows are left out and listed. */
export async function importCommit(kind: SheetKind, override?: ImportOverride): Promise<ImportResult> {
  await requireActor();
  await requireSalesSheetSync();
  if (!isKind(kind)) return { ok: false, error: "Jenis sheet tidak dikenal." };
  try {
    const { c, sheet, config } = await prepare(kind, override);
    const current = await existing(kind);
    const plan = planImport({ kind, headers: sheet.headers, rows: sheet.rows, columns: config.columns, values: config.values, dateOrder: config.dateOrder, existing: current, pics: await loadSalesPics() });
    if (plan.missingRequired.length && plan.summary.create) return { ok: false, error: `Petakan kolom wajib dulu: ${plan.missingRequired.join(", ")}.` };
    const byKey = new Map(current.map((e) => [e.key.trim().toLowerCase(), e]));
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; fullName?: string; name?: string; email?: string } | undefined;
    const actor = { actor_user_id: user?.id ?? null, actor_name: user?.fullName ?? user?.name ?? user?.email ?? "Unknown" };

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
    await logActivity("sales", "update", `Import Google Sheet "${c.sheet_name}": ${s.create} baru, ${s.update} diubah, ${s.error} gagal`, kind === "ot" ? "Opportunity Tracker" : "PQ Tracker");
    revalidatePath(kind === "ot" ? "/sales/v2/opportunity-tracker" : "/sales/v2/pq-tracker");
    return { ok: true, created: s.create, updated: s.update, same: s.same, skipped: s.skip, failed: plan.rows.filter((r) => r.status === "error").map((r) => ({ row: r.row, issues: r.issues })) };
  } catch (e) {
    return { ok: false, error: `Import dibatalkan, tidak ada yang tersimpan. ${e instanceof Error ? e.message.slice(0, 200) : ""}` };
  }
}

export type PushPreview = { ok: true; tab: string; cells: number; rows: number; append: number; sample: { at: string; old: string | null; value: string }[] } | { ok: false; error: string };

async function pushPlan(kind: SheetKind) {
  const c = await connection(kind);
  const config = readConfig(c.column_mapping, c.sheet_name);
  if (!Object.values(config.columns).some(Boolean)) throw new Error("Simpan pemetaan kolom tab ini dulu (langkah Kolom).");
  const sheet = await readTab(c.spreadsheet_id, c.sheet_name);
  const plan = planPush({ kind, headers: sheet.headers, rows: sheet.rows, columns: config.columns, values: config.values, dateOrder: config.dateOrder, records: await existing(kind), pics: await loadSalesPics() });
  if (plan.keyMissing) throw new Error("Kolom Opty No belum dipetakan; tanpa itu baris tidak bisa dicocokkan.");
  return { c, sheet, plan };
}

export async function pushPreview(kind: SheetKind): Promise<PushPreview> {
  await requireActor();
  await requireSalesSheetSync();
  if (!isKind(kind)) return { ok: false, error: "Jenis sheet tidak dikenal." };
  try {
    await requireDivisionAccess("sales", "full");
    const { c, plan } = await pushPlan(kind);
    return {
      ok: true, tab: c.sheet_name, cells: plan.cells.length, rows: plan.rowsTouched, append: plan.append.length,
      sample: plan.cells.slice(0, 15).map((x) => ({ at: `${columnLetter(x.col)}${x.row}`, old: clip(x.old, 40), value: clip(String(x.value), 40)! })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal menyiapkan Push." };
  }
}

export type PushResult = { ok: true; cells: number; appended: number } | { ok: false; error: string };

export async function pushCommit(kind: SheetKind, appendNew: boolean): Promise<PushResult> {
  await requireActor();
  await requireSalesSheetSync();
  if (!isKind(kind)) return { ok: false, error: "Jenis sheet tidak dikenal." };
  try {
    await requireDivisionAccess("sales", "full");
    const { c, sheet, plan } = await pushPlan(kind);
    const tab = quoteSheetName(c.sheet_name);
    await writeSheetCells(sheet.token, c.spreadsheet_id, plan.cells.map((x) => ({ range: `${tab}!${columnLetter(x.col)}${x.row}`, value: x.value })));
    if (appendNew) await appendSheetRows(sheet.token, c.spreadsheet_id, c.sheet_name, plan.append);
    await logActivity("sales", "update", `Push ke Google Sheet "${c.sheet_name}": ${plan.cells.length} sel diubah${appendNew ? `, ${plan.append.length} baris ditambah` : ""}`, kind === "ot" ? "Opportunity Tracker" : "PQ Tracker");
    return { ok: true, cells: plan.cells.length, appended: appendNew ? plan.append.length : 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Push gagal." };
  }
}

/** Columns the rules left unmapped, matched by the model from their names and a few examples. Only suggestions. */
export async function aiMapColumns(kind: SheetKind, columns: { name: string; samples: string[] }[]): Promise<{ ok: true; columns: Record<string, string> } | { ok: false; error: string }> {
  await requireActor();
  await requireSalesSheetSync();
  if (!isKind(kind)) return { ok: false, error: "Jenis sheet tidak dikenal." };
  const base = intelligenceBase();
  if (!agentEnabled() || !base) return { ok: false, error: "AI belum dikonfigurasi." };
  const fields = SHEET_FIELDS[kind];
  const list = columns.slice(0, 60).map((c) => ({ name: String(c.name).slice(0, 80), samples: (c.samples ?? []).slice(0, 3).map((s) => String(s).slice(0, 60)) }));
  const text = [
    "FIELDS (key: label)", ...fields.map((f) => `${f.key}: ${f.label}`),
    "", "COLUMNS (name: examples)", ...list.map((c) => `${c.name}: ${c.samples.join(" | ") || "-"}`),
  ].join("\n").slice(0, 12000);
  try {
    const actor = await agentActor();
    const res = await fetch(`${base}/api/agent/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ERP-Delegation": delegate(actor, { path: "/sales/v2", module: "sales", entity: null }) },
      body: JSON.stringify({ form: "sheet_columns", text }),
      signal: AbortSignal.timeout(45_000), cache: "no-store",
    });
    const out = (await res.json().catch(() => ({}))) as { fields?: { mapping?: Record<string, unknown> } };
    if (!res.ok) return { ok: false, error: "AI belum bisa memetakan kolom ini." };
    // Only real columns, only real fields, each field once.
    const names = new Set(list.map((c) => c.name)), keys = new Set(fields.map((f) => f.key)), used = new Set<string>();
    const result: Record<string, string> = {};
    for (const [col, key] of Object.entries(out.fields?.mapping ?? {})) {
      if (names.has(col) && typeof key === "string" && keys.has(key) && !used.has(key)) { result[col] = key; used.add(key); }
    }
    return { ok: true, columns: result };
  } catch {
    return { ok: false, error: "AI belum tersedia." };
  }
}
