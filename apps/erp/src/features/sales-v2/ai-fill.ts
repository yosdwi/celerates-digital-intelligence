// AI form fill (roadmap #3): the model reads a pasted client email or RFQ and proposes New Opportunity fields. Its
// answer is untrusted data: only known fields survive, codes must be V1's, numbers must be sane. Nothing is saved
// here; the values land in the form for the person to check and submit. Pure, tested directly.
import { CLIENT_TYPES, LEVELS, PRICE_PERIODS, SERVICE_TYPES } from "./model";

export const AI_FIELDS = [
  "client_name", "client_type_code", "service_type_code", "position_name", "level_code", "headcount_target",
  "estimated_duration_months", "price_amount", "price_period_code", "requirement_summary", "detail_requirement",
] as const;
export type AiField = (typeof AI_FIELDS)[number];

const CODES: Partial<Record<AiField, Set<string>>> = {
  client_type_code: new Set(CLIENT_TYPES.map(([v]) => v)),
  service_type_code: new Set(SERVICE_TYPES.map(([v]) => v)),
  level_code: new Set(LEVELS.map(([v]) => v)),
  price_period_code: new Set(PRICE_PERIODS.map(([v]) => v)),
};
const NUMBERS: Partial<Record<AiField, [number, number]>> = {
  headcount_target: [1, 500],
  estimated_duration_months: [1, 120],
  price_amount: [1, 10_000_000_000],
};
const TEXT_MAX: Partial<Record<AiField, number>> = { client_name: 200, position_name: 120, requirement_summary: 500, detail_requirement: 3000 };

/** The model's JSON as form values (strings, as the form's draft holds them); anything doubtful is dropped. */
export function normalizeAiFill(raw: unknown): Partial<Record<AiField, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Partial<Record<AiField, string>> = {};
  for (const key of AI_FIELDS) {
    const v = src[key];
    if (v == null || v === "") continue;
    const codes = CODES[key];
    const range = NUMBERS[key];
    if (codes) {
      const code = String(v).trim().toLowerCase().replace(/[\s-]+/g, "_");
      if (codes.has(code)) out[key] = code;
    } else if (range) {
      // Rupiah is written with dots for thousands ("Rp 15.000.000"); counts take the first whole number ("3 orang").
      const n = typeof v === "number" ? v : key === "price_amount" ? Number(String(v).replace(/[^\d]/g, "")) : Number(String(v).match(/\d+/)?.[0]);
      if (Number.isFinite(n) && n >= range[0] && n <= range[1]) out[key] = String(Math.round(n));
    } else if (typeof v === "string" && v.trim()) {
      out[key] = v.trim().slice(0, TEXT_MAX[key] ?? 500);
    }
  }
  return out;
}
