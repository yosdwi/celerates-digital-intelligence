// Sales V2 Profitability Tracker view model: one row per talent assignment for a period, as V1
// (app/sales/profitability-tracker) reads them, with V1's totals, margin thresholds and charts. Pure: no React, no
// database, so it is tested directly (tests/sales-v2.test.ts).
import type { StoredView } from "./model";

export type ProfitRow = {
  id: string; // the profitability entry
  assignmentId: string;
  talent: string;
  client: string;
  role: string | null;
  price: number;
  cogs: number;
  margin: number;
  marginPct: number;
  syncedBy: string;
  syncedAt: string;
  /** This talent's margin in the other synced periods, newest first. */
  trend: { period: string; margin: number; marginPct: number }[];
};

// ── Period ("2026-10" in the URL) ───────────────────────────────────────────────────────────────────────────
export type Period = { year: number; month: number };
const pad = (n: number) => String(n).padStart(2, "0");
export const periodKey = (p: Period) => `${p.year}-${pad(p.month)}`;
/** The `period` parameter, or the current month when it is missing or malformed. */
export function parsePeriod(raw: string | undefined | null, now = new Date()): Period {
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  const year = m ? Number(m[1]) : NaN;
  const month = m ? Number(m[2]) : NaN;
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : { year: now.getFullYear(), month: now.getMonth() + 1 };
}
export function shiftPeriod(p: Period, delta: number): Period {
  const i = p.year * 12 + (p.month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}
export const periodLabel = (p: Period) => new Date(Date.UTC(p.year, p.month - 1, 1)).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

// ── Margin bands: V1's pill colours (below 0 red, below 15 % amber, otherwise green) ─────────────────────────
export const BANDS = [
  { id: "loss", title: "Rugi (< 0%)", accent: "#ef4444", swatch: 8 as const },
  { id: "thin", title: "Tipis (< 15%)", accent: "#f59e0b", swatch: 9 as const },
  { id: "healthy", title: "Sehat (≥ 15%)", accent: "#10b981", swatch: 5 as const },
];
export const bandOf = (pct: number) => (pct < 0 ? "loss" : pct < 15 ? "thin" : "healthy");
export const BAND_LABEL: Record<string, string> = Object.fromEntries(BANDS.map((b) => [b.id, b.title]));

/** V1's cards: sums, and the average margin as total margin over total price (not a mean of percentages). */
export function totals(rows: Pick<ProfitRow, "price" | "cogs" | "margin">[]) {
  const price = rows.reduce((s, r) => s + r.price, 0);
  const cogs = rows.reduce((s, r) => s + r.cogs, 0);
  const margin = rows.reduce((s, r) => s + r.margin, 0);
  return { price, cogs, margin, pct: price ? (margin / price) * 100 : 0 };
}

/** V1's charts: margin per group, in millions (one decimal), highest first, top `limit`. */
export function marginBy(rows: ProfitRow[], key: (r: ProfitRow) => string, limit = 8) {
  const sums = new Map<string, number>();
  for (const r of rows) sums.set(key(r), (sums.get(key(r)) ?? 0) + r.margin);
  return Array.from(sums, ([label, v]) => ({ label, value: Math.round((v / 1_000_000) * 10) / 10 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function profitFieldValue(r: ProfitRow, key: string): unknown {
  if (key === "band") return BAND_LABEL[bandOf(r.marginPct)];
  const v = (r as Record<string, unknown>)[key];
  return v ?? "";
}

export function profitMatchesSearch(r: ProfitRow, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [r.talent, r.client, r.role, r.syncedBy].some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
}

export const PROFIT_FIELD_KEYS = new Set(["talent", "client", "role", "price", "cogs", "margin", "marginPct", "band", "syncedBy", "syncedAt"]);

const view = (id: string, name: string, bands: string[] = []): StoredView => ({
  id, name, builtIn: true,
  state: { view: "table", q: "", filters: bands.length ? [{ id: `b-${id}`, key: "band", op: "isanyof", value: "", values: bands.map((b) => BAND_LABEL[b]) }] : [], sorts: [] },
});
export const PROFIT_BUILT_IN_VIEWS: StoredView[] = [
  view("all", "Semua talent"),
  view("low", "Margin < 15%", ["loss", "thin"]),
  view("loss", "Rugi", ["loss"]),
];

/** V1's columns, in V1's order; who synced and when start hidden. */
export const PROFIT_DEFAULT_SHOWN = ["client", "role", "price", "cogs", "margin", "marginPct"];
