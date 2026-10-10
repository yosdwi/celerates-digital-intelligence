// Sales V2 Overtime & Business Trip view model: claims as V1 (app/pmo/overtime-business-trip) reads them, with V1's
// labels, flow (PMO → Sales → Finance → Invoiced) and forms. Field names are V1's stored ones, so a cell edit posts V1's
// form unchanged. Pure: no React, no database, so it is tested directly (tests/sales-v2.test.ts).
import {
  BILLING_STATUSES, CLAIM_STATUSES, CLAIM_STATUS_LABELS, CLAIM_TYPES, CLAIM_TYPE_LABELS, SIMPLE_PROGRESS_STATUSES, TALENT_PAYMENT_STATUSES,
} from "@/app/pmo/overtime-business-trip/constants";
import type { StoredView } from "./model";

export { BILLING_STATUSES, CLAIM_STATUSES, CLAIM_STATUS_LABELS, CLAIM_TYPES, CLAIM_TYPE_LABELS, SIMPLE_PROGRESS_STATUSES, TALENT_PAYMENT_STATUSES };

export type OtClaim = {
  id: string;
  claim_no: string;
  opportunity_id: string | null;
  employee_id: string | null;
  claim_type_code: string;
  claim_title: string;
  days_count: number | null;
  start_date: string | null;
  end_date: string | null;
  duration_hours_client: number | null;
  duration_hours_pmo_basic: number | null;
  duration_hours_payroll: number | null;
  spk_url: string | null;
  timesheet_url: string | null;
  draft_timesheet_url: string | null;
  pq_submit_date: string | null;
  pq_status_code: string | null;
  po_status_code: string | null;
  cr_status_code: string | null;
  pic_1_name: string | null;
  pic_2_name: string | null;
  amount_given_to_talent_initial: number | null;
  amount_claim_to_client_total: number | null;
  amount_bt_medical_to_client: number | null;
  amount_uang_saku_celerates: number | null;
  amount_transport: number | null;
  amount_over_bagasi: number | null;
  amount_etc: number | null;
  amount_total_given_to_talent: number | null;
  talent_payment_status_code: string;
  talent_payment_date: string | null;
  invoice_no: string | null;
  amount_total_billed_to_client: number | null;
  billing_status_code: string;
  status_code: string;
  notes: string | null;
  created_at: string;
  opty_no: string | null;
  client_name: string | null;
  project_name: string | null;
  employee_no: string | null;
  candidate_name: string | null;
};

const labels = (pairs: readonly (readonly [string, string])[]) => Object.fromEntries(pairs) as Record<string, string>;
export const PROGRESS_LABELS = labels(SIMPLE_PROGRESS_STATUSES);
export const PAYMENT_LABELS = labels(TALENT_PAYMENT_STATUSES);
export const BILLING_LABELS = labels(BILLING_STATUSES);

// ── Flow: V1's buttons, one step forward at a time, each by its division ────────────────────────────────────
export const FLOW: string[] = CLAIM_STATUSES.map(([id]) => id);
export type FlowStep = "forward" | "submit" | "invoice";
const STEP: Record<string, { step: FlowStep; division: string; label: string }> = {
  forwarded_to_sales: { step: "forward", division: "pmo", label: "Forward ke Sales" },
  submitted_to_finance: { step: "submit", division: "sales", label: "Submit ke Finance" },
  invoiced: { step: "invoice", division: "finance", label: "Input invoice" },
};
/** The step that moves a claim from `from` to `to`, or why it cannot (V1 only moves forward, one step at a time). */
export function flowMove(from: string, to: string): { step: FlowStep; division: string } | { error: string } {
  const i = FLOW.indexOf(from);
  if (FLOW.indexOf(to) !== i + 1 || !STEP[to]) {
    return { error: FLOW.indexOf(to) <= i ? "Alur klaim hanya maju; status tidak bisa dikembalikan." : "Alur klaim maju satu langkah: PMO → Sales → Finance → Invoiced." };
  }
  return STEP[to];
}
/** The next step for a claim, if any (the panel's primary button). */
export function nextStep(status: string) {
  const to = FLOW[FLOW.indexOf(status) + 1];
  return to ? { to, ...STEP[to] } : null;
}

// ── Fields ─────────────────────────────────────────────────────────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** V1's "Bulan Claim": the start date's month, or the creation month. */
export function claimMonth(c: Pick<OtClaim, "start_date" | "created_at">) {
  const d = (c.start_date ?? c.created_at).slice(0, 7);
  const [y, m] = d.split("-").map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : "";
}
const CODED: Record<string, Record<string, string>> = {
  claim_type_code: CLAIM_TYPE_LABELS, status_code: CLAIM_STATUS_LABELS, pq_status_code: PROGRESS_LABELS, po_status_code: PROGRESS_LABELS,
  cr_status_code: PROGRESS_LABELS, talent_payment_status_code: PAYMENT_LABELS, billing_status_code: BILLING_LABELS,
};
const PROGRESS_KEYS = new Set(["pq_status_code", "po_status_code", "cr_status_code"]);
/** Value a filter, sort or search reads: labels for coded fields, so a person filters by what they see. */
export function otFieldValue(c: OtClaim, key: string): unknown {
  if (key === "claim_month") return claimMonth(c);
  const v = (c as Record<string, unknown>)[key];
  if (CODED[key]) {
    // V1 shows a blank PQ/PO/CR status as Not Started.
    const code = (v as string | null) || (PROGRESS_KEYS.has(key) ? "not_started" : "");
    return code ? CODED[key][code] ?? code : "";
  }
  return v ?? "";
}

export function otMatchesSearch(c: OtClaim, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [c.claim_no, c.claim_title, c.candidate_name, c.employee_no, c.opty_no, c.client_name, c.project_name, c.invoice_no, c.notes]
    .some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
}

export const MONEY_FIELDS = [
  "amount_given_to_talent_initial", "amount_claim_to_client_total", "amount_bt_medical_to_client", "amount_uang_saku_celerates",
  "amount_transport", "amount_over_bagasi", "amount_etc", "amount_total_given_to_talent", "amount_total_billed_to_client",
] as const;
export const NUMBER_FIELDS = new Set<string>([...MONEY_FIELDS, "days_count", "duration_hours_client", "duration_hours_pmo_basic", "duration_hours_payroll"]);
export const DATE_FIELDS = new Set(["start_date", "end_date", "pq_submit_date", "talent_payment_date"]);

/** The fields V1's PMO form posts (createClaim / updateClaim), in its order. */
export const FORM_FIELDS = [
  "claim_type_code", "claim_title", "opportunity_id", "employee_id", "days_count", "start_date", "end_date",
  "duration_hours_client", "duration_hours_pmo_basic", "duration_hours_payroll", "spk_url", "timesheet_url", "draft_timesheet_url",
  "pq_submit_date", "pq_status_code", "po_status_code", "cr_status_code", "pic_1_name",
  "amount_given_to_talent_initial", "amount_claim_to_client_total", "amount_bt_medical_to_client", "amount_uang_saku_celerates",
  "amount_transport", "amount_over_bagasi", "amount_etc", "notes",
] as const;
export type FormField = (typeof FORM_FIELDS)[number];

/** A typed value as stored: digits for numbers ("Rp 1.500.000" → 1500000), YYYY-MM-DD for dates, else trimmed text.
 *  Throws the reason for a value V1's columns would refuse. */
export function parseField(key: string, raw: string): string | number | null {
  const v = raw.trim();
  if (!v) return null;
  if (NUMBER_FIELDS.has(key)) {
    const d = v.replace(/[^\d]/g, "");
    if (!d) throw new Error("Isi angka");
    return Number(d);
  }
  if (DATE_FIELDS.has(key) && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Tanggal ditulis YYYY-MM-DD");
  return v;
}

/** V1's full PMO form for a claim with one field changed: every other field posted as it is, so the action keeps it. */
export function claimForm(c: OtClaim, key: FormField, raw: string): FormData {
  const fd = new FormData();
  const next = { ...c, [key]: parseField(key, raw) } as Record<string, unknown>;
  for (const k of FORM_FIELDS) fd.set(k, next[k] == null ? "" : String(next[k]));
  return fd;
}

/** V1's HR form: status, amount and date together; a status change keeps the other two. */
export function paymentForm(c: OtClaim, patch: { status?: string; amount?: string; date?: string }): FormData {
  const fd = new FormData();
  fd.set("talent_payment_status_code", patch.status ?? c.talent_payment_status_code);
  fd.set("amount_total_given_to_talent", patch.amount !== undefined ? String(parseField("amount_total_given_to_talent", patch.amount) ?? "") : String(c.amount_total_given_to_talent ?? ""));
  fd.set("talent_payment_date", patch.date !== undefined ? String(parseField("talent_payment_date", patch.date) ?? "") : c.talent_payment_date ?? "");
  return fd;
}

export const OT_FIELD_KEYS = new Set([...FORM_FIELDS, "claim_no", "claim_month", "pic_2_name", "amount_total_given_to_talent", "talent_payment_status_code",
  "talent_payment_date", "invoice_no", "amount_total_billed_to_client", "billing_status_code", "status_code", "created_at", "opty_no", "client_name",
  "project_name", "employee_no", "candidate_name"]);

const view = (id: string, name: string, key?: string, value?: string): StoredView => ({
  id, name, builtIn: true,
  state: { view: "table", q: "", filters: key ? [{ id: `b-${id}`, key, op: "is", value: value! }] : [], sorts: [] },
});
/** V1's six cards, each a view. */
export const OT_BUILT_IN_VIEWS: StoredView[] = [
  view("all", "Semua klaim"),
  view("draft", "Draft (PMO)", "status_code", CLAIM_STATUS_LABELS.draft),
  view("at_sales", "Di Sales", "status_code", CLAIM_STATUS_LABELS.forwarded_to_sales),
  view("at_finance", "Di Finance", "status_code", CLAIM_STATUS_LABELS.submitted_to_finance),
  view("invoiced", "Invoiced", "status_code", CLAIM_STATUS_LABELS.invoiced),
  view("payment_pending", "Pencairan Pending", "talent_payment_status_code", PAYMENT_LABELS.pending),
];

/** The columns V1 users scan first; every other V1 column is under Kolom. */
export const OT_DEFAULT_SHOWN = [
  "claim_month", "claim_type_code", "candidate_name", "client_name", "start_date", "end_date", "days_count", "status_code",
  "amount_claim_to_client_total", "amount_given_to_talent_initial", "invoice_no", "billing_status_code", "talent_payment_status_code", "pic_1_name",
];
