"use server";
// Google Sheet import and push for Sales V2 (QA 2026-10-09, docs/design/SALES-SHEET-SYNC-STRESS-TEST.md §5). The sheet
// and the database are read here; every decision is made by the pure plan (sheet-import.ts), recomputed on the
// server for each commit, so nothing the browser sends is written without being checked again. Same guard as V1:
// Sales editors import; pushing to the team's sheet needs Sales Full or Owner.
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActor } from "@/lib/actor";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { requireSalesSheetSync } from "@/lib/integration-policy";
import { logActivity } from "@/lib/activity-log";
import { appendSheetRows, quoteSheetName, writeSheetCells } from "@/lib/google-sheets";
import { agentActor, agentEnabled, delegate, intelligenceBase } from "@/lib/agent/bff";
import { loadSalesPics } from "./data";
import { clip, connection, existing, isKind, prepare, readTab, runImportCommit, type ImportOverride, type ImportResult } from "./sheet-import-core";
export type { ImportOverride, ImportResult } from "./sheet-import-core";
import {
  SHEET_FIELDS, columnLetter, planImport, planPush, readConfig,
  type ColumnMatch, type DateOrder, type ImportPlan, type SheetKind,
} from "./sheet-import";

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

/** Imports the rows the preview marked create or update, in one transaction; error rows are left out and listed. */
export async function importCommit(kind: SheetKind, override?: ImportOverride): Promise<ImportResult> {
  await requireActor();
  await requireSalesSheetSync();
  if (!isKind(kind)) return { ok: false, error: "Jenis sheet tidak dikenal." };
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; fullName?: string; name?: string; email?: string } | undefined;
  const result = await runImportCommit(kind, { id: user?.id ?? null, name: user?.fullName ?? user?.name ?? user?.email ?? "Unknown" }, override);
  if (result.ok) {
    await logActivity("sales", "update", `Import Google Sheet "${result.tab}": ${result.created} baru, ${result.updated} diubah, ${result.failed.length} gagal`, kind === "ot" ? "Opportunity Tracker" : "PQ Tracker");
    revalidatePath(kind === "ot" ? "/sales/v2/opportunity-tracker" : "/sales/v2/pq-tracker");
  }
  return result;
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
