// Form fill (roadmap #3): the model reads a pasted email, RFQ, signature or PO/PKS and proposes form fields. Its answer is
// untrusted data: only the form's own fields survive, codes must be V1's, numbers sane, dates real. Nothing is saved
// here; the values land in the form for the person to check and submit. Also the Extension prefill, which needs no AI:
// it copies the talent's current contract. Pure, tested directly.
import { SALES_TYPES } from "@/app/sales/pq-constants";
import { BUSINESS_UNITS, CLIENT_TYPES, LEVELS, PRICE_PERIODS, SERVICE_TYPES, STAGES } from "./model";

type Pairs = readonly (readonly [string, string])[];
type Kind = { code: Pairs } | { num: [number, number]; money?: boolean } | { text: number } | { date: true };

const code = (pairs: Pairs): Kind => ({ code: pairs });
const text = (max: number): Kind => ({ text: max });
const DATE: Kind = { date: true };
const HEADCOUNT: Kind = { num: [1, 500] };
const MONTHS: Kind = { num: [1, 120] };
const PRICE: Kind = { num: [1, 10_000_000_000], money: true };

/** Each form's fields the model may fill, with what a valid value is. Keys are the V1 form field names. */
export const AI_FORMS = {
  opportunity: {
    client_name: text(200), client_type_code: code(CLIENT_TYPES), service_type_code: code(SERVICE_TYPES), position_name: text(120),
    level_code: code(LEVELS), headcount_target: HEADCOUNT, estimated_duration_months: MONTHS, price_amount: PRICE,
    price_period_code: code(PRICE_PERIODS), requirement_summary: text(500), detail_requirement: text(3000),
  },
  pq: {
    client_name: text(200), project_name: text(200), position_name: text(120), service_type_code: code(SERVICE_TYPES),
    business_unit_code: code(BUSINESS_UNITS), level_code: code(LEVELS), headcount_target: HEADCOUNT, estimated_duration_months: MONTHS,
    price_amount: PRICE, price_period_code: code(PRICE_PERIODS), start_date: DATE, end_date: DATE, approval_date: DATE,
    po_no: text(80), pks_no: text(80), cr_no: text(80), sales_type_code: code(SALES_TYPES), project_details: text(1000), notes: text(1000),
  },
  extension: {
    position_name: text(120), level_code: code(LEVELS), headcount_target: HEADCOUNT, estimated_duration_months: MONTHS,
    price_amount: PRICE, price_period_code: code(PRICE_PERIODS), start_date: DATE, end_date: DATE, notes: text(1000),
  },
  account: { name: text(200), industry: text(120), notes: text(1000) },
  contact: { name: text(120), role_title: text(120), email: text(200), phone: text(40) },
  opportunity_update: {
    opty_status_code: code(STAGES.map((s) => [s.id, s.title] as const)), progress_note: text(500), position_name: text(120),
    level_code: code(LEVELS), headcount_target: HEADCOUNT, estimated_duration_months: MONTHS, price_amount: PRICE,
    price_period_code: code(PRICE_PERIODS), dropped_reason: text(500),
  },
} satisfies Record<string, Record<string, Kind>>;
export type AiForm = keyof typeof AI_FORMS;
export const isAiForm = (f: unknown): f is AiForm => typeof f === "string" && Object.hasOwn(AI_FORMS, f);

export type Draft = Record<string, string>;
export type AiContact = { name: string; role_title?: string; email?: string; phone?: string };
export type AiResult = { fields: Draft; contacts: AiContact[] };

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

function value(kind: Kind, v: unknown): string | null {
  if (v == null || v === "") return null;
  if ("code" in kind) {
    const c = String(v).trim().toLowerCase().replace(/[\s-]+/g, "_");
    return kind.code.some(([k]) => k === c) ? c : null;
  }
  if ("num" in kind) {
    // Rupiah is written with dots for thousands ("Rp 15.000.000"); counts take the first whole number ("3 orang").
    const n = typeof v === "number" ? v : kind.money ? Number(String(v).replace(/[^\d]/g, "")) : Number(String(v).match(/\d+/)?.[0]);
    return Number.isFinite(n) && n >= kind.num[0] && n <= kind.num[1] ? String(Math.round(n)) : null;
  }
  if ("date" in kind) {
    const s = String(v).trim().slice(0, 10);
    const d = new Date(`${s}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= "2000-01-01" && s <= "2100-12-31" ? s : null;
  }
  return typeof v === "string" && v.trim() ? v.trim().slice(0, kind.text) : null;
}

/** The model's JSON as form values (strings, as the form's draft holds them); anything doubtful is dropped. */
export function normalizeAiFill(raw: unknown, form: AiForm = "opportunity"): Draft {
  return normalizeAiResult(raw, form).fields;
}

export function normalizeAiResult(raw: unknown, form: AiForm): AiResult {
  const out: AiResult = { fields: {}, contacts: [] };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const [key, kind] of Object.entries(AI_FORMS[form]) as [string, Kind][]) {
    const v = value(kind, src[key]);
    if (v != null) out.fields[key] = v;
  }
  if (out.fields.email && !EMAIL.test(out.fields.email)) delete out.fields.email;
  if (out.fields.email) out.fields.email = out.fields.email.toLowerCase();
  if (form === "account" && Array.isArray(src.contacts)) {
    for (const c of src.contacts.slice(0, 10)) {
      const f = normalizeAiResult(c, "contact").fields;
      if (f.name) out.contacts.push({ name: f.name, role_title: f.role_title, email: f.email, phone: f.phone });
    }
  }
  return out;
}

/**
 * AI never overwrites what the person typed: a field takes the proposal only when it is empty, still at the form's
 * default, or was itself filled by an earlier proposal (`replaceable`). Returns the merged draft and the keys filled.
 */
export function mergeFill(current: Draft, fields: Draft, defaults: Draft = {}, replaceable: string[] = []): { draft: Draft; filled: string[] } {
  const draft = { ...current };
  const filled: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    const cur = (current[k] ?? "").trim();
    if (cur && cur !== defaults[k] && !replaceable.includes(k)) continue;
    if (cur === v) continue;
    draft[k] = v;
    filled.push(k);
  }
  return { draft, filled };
}

// ── Extension prefill: the talent's current contract, no AI ──────────────────────────────────────────────────────
export type ContractSource = {
  employeeName: string | null;
  employeePosition: string | null;
  assignment: { start: string | null; end: string | null; price: number | null } | null;
  pq: {
    client: string; project: string | null; position: string | null; service: string | null; businessUnit: string | null; level: string | null;
    pricePeriod: string | null; price: number | null; duration: number | null; priority: string | null; salesPic: string | null;
  } | null;
  requisition: { client: string; position: string; service: string | null; level: string | null; salesPic: string | null } | null;
};

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

/** Extension form values from the contract being extended: same client, role and price; starts the day after it ends. */
export function extensionPrefill(s: ContractSource): Draft {
  const pq = s.pq, req = s.requisition, a = s.assignment;
  const out: Draft = {
    client_name: pq?.client ?? req?.client ?? "",
    client_type_code: pq?.client || req?.client ? "existing" : "",
    project_name: pq?.project ?? "",
    position_name: pq?.position ?? req?.position ?? s.employeePosition ?? "",
    service_type_code: pq?.service ?? req?.service ?? "",
    business_unit_code: pq?.businessUnit ?? "",
    level_code: pq?.level ?? req?.level ?? "",
    headcount_target: "1",
    priority_code: pq?.priority ?? "",
    price_amount: String(a?.price ?? pq?.price ?? ""),
    price_period_code: pq?.pricePeriod ?? "",
    sales_pic_name: pq?.salesPic ?? req?.salesPic ?? "",
    estimated_duration_months: pq?.duration ? String(pq.duration) : "",
  };
  if (a?.end) {
    out.start_date = addDays(a.end, 1);
    if (pq?.duration) out.end_date = addDays(addMonths(out.start_date, pq.duration), -1);
  }
  if (s.employeeName) out.notes = `Perpanjangan ${s.employeeName}${a?.start && a?.end ? `, kontrak sebelumnya ${a.start} s/d ${a.end}` : ""}.`;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== ""));
}

/** New PQ has no Document Tracker fields (V1's create form): numbers the AI read from the PO / PKS go into Notes. */
export function pqCreateFields(fields: Draft): Draft {
  const { po_no, pks_no, cr_no, sales_type_code: _salesType, project_details, notes, ...rest } = fields;
  const docs = [po_no && `No PO: ${po_no}`, pks_no && `No PKS: ${pks_no}`, cr_no && `No CR: ${cr_no}`].filter(Boolean).join(" · ");
  const merged = [docs, project_details, notes].filter(Boolean).join("\n");
  return merged ? { ...rest, notes: merged } : rest;
}

// ── Edit Opportunity: AI proposes, the person approves each change ─────────────────────────────────────────────
export type Suggestion = { key: string; label: string; current: string; proposed: string; note?: string };

const UPDATE_LABELS: Record<string, string> = {
  opty_status_code: "Stage", position_name: "Positions", level_code: "Level", headcount_target: "Headcount",
  estimated_duration_months: "Estimasi Durasi (bulan)", price_amount: "Price", price_period_code: "Price Period", dropped_reason: "Dropped Reason",
};

/**
 * The model's proposals against the form as it is now, one row per field that would change. A progress note is added
 * on top of Progress Notes with the date; Last Communication comes from the latest stored email, not the model.
 */
export function updateSuggestions(current: Draft, fields: Draft, lastMail: string | null, today: string): Suggestion[] {
  const out: Suggestion[] = [];
  for (const [key, label] of Object.entries(UPDATE_LABELS)) {
    const v = fields[key];
    if (!v || v === (current[key] ?? "")) continue;
    if (key === "dropped_reason" && (fields.opty_status_code ?? current.opty_status_code) !== "dropped") continue;
    out.push({ key, label, current: current[key] ?? "", proposed: v });
  }
  if (fields.progress_note) {
    const line = `${today}: ${fields.progress_note}`;
    const prev = (current.progress_notes ?? "").trim();
    out.push({ key: "progress_notes", label: "Progress Notes", current: prev, proposed: prev ? `${line}\n${prev}` : line, note: line });
  }
  if (lastMail && lastMail > (current.last_communication_date ?? "")) {
    out.push({ key: "last_communication_date", label: "Last Communication", current: current.last_communication_date ?? "", proposed: lastMail, note: "dari email terakhir" });
  }
  return out;
}
