// Sales V2 view model: Celerates Opportunity Tracker rows in the shape the Crisp views read, plus the URL state
// every view shares (docs/design/SALES-V2-CRISP-UX-CONTRACT.md §7). Pure: no React, no database, so it is tested
// directly (tests/sales-v2.test.ts).
import type { ToolbarFilter, ToolbarSort } from "@crisp-ui-kit/crisp";

// `swatch` is Crisp's fixed tag palette (7 grey, 10 blue, 11 violet, 9 orange, 5 green, 8 red); `accent` the matching
// solid colour for the Kanban column dot.
export const STAGES = [
  { id: "cv_submission", title: "CV Submission", swatch: 7, accent: "#8a8f98" },
  { id: "solutioning", title: "Solutioning", swatch: 10, accent: "#3b82f6" },
  { id: "proposal_sent", title: "Proposal Sent", swatch: 11, accent: "#8b5cf6" },
  { id: "need_action", title: "Need Action", swatch: 9, accent: "#f97316" },
  { id: "win", title: "Win", swatch: 5, accent: "#10b981" },
  { id: "dropped", title: "Dropped", swatch: 8, accent: "#ef4444" },
] as const;
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.id, s.title]));

export const SERVICE_TYPES = [
  ["outsourcing", "Outsourcing"], ["headhunting", "Headhunting"], ["outplacement", "Outplacement"],
  ["managed_service", "Managed Service"], ["project_based", "Project Based"], ["rpo", "RPO"],
  ["training", "Training"], ["license", "License"], ["hardware", "Hardware"],
] as const;
export const CLIENT_TYPES = [["existing", "Existing"], ["new", "New"]] as const;
export const BANTE_SCORES = [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]] as const;
export const PRICE_PERIODS = [["monthly", "Per Bulan"], ["project", "Per Project"], ["yearly", "Per Tahun"], ["daily", "Per Hari"]] as const;
export const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
export const BUSINESS_UNITS = [["tm", "TM"], ["cs", "CS"], ["solution", "SOLUTION"], ["other", "Other"]] as const;
export const PRIORITIES = [["p0", "P0"], ["p1", "P1"], ["p2", "P2"], ["p3", "P3"]] as const;

const label = (pairs: readonly (readonly [string, string])[]) => Object.fromEntries(pairs) as Record<string, string>;
export const SERVICE_LABEL = label(SERVICE_TYPES);
export const CLIENT_TYPE_LABEL = label(CLIENT_TYPES);
export const LEVEL_LABEL = label(LEVELS);
const PERIOD_SUFFIX: Record<string, string> = { monthly: "/bulan", project: "/project", yearly: "/tahun", daily: "/hari" };

export type SignatureStatus = "not_sent" | "pending" | "signed" | "rejected";

export type Opportunity = {
  id: string;
  optyNo: string;
  leadId: string | null;
  leadNo: string | null;
  client: string;
  clientType: string | null;
  serviceType: string | null;
  position: string | null;
  level: string | null;
  headcount: number | null;
  durationMonths: number | null;
  salesQualified: boolean;
  requirement: string | null;
  detailRequirement: string | null;
  closingPrice: number | null;
  price: number | null;
  pricePeriod: string | null;
  salesPic: string;
  lastCommunication: string | null;
  bante: number | null;
  progressNotes: string | null;
  droppedReason: string | null;
  status: string;
  createdAt: string | null;
  /** Downstream: Requisition handed to Talent Acquisition (with its pipeline counts). */
  requisition: { id: string; no: string; applications: number; onboarding: number } | null;
  /** Downstream: PQ Tracker row. Its existence is what V1 calls "already converted". */
  pq: { id: string; no: string | null; stage: string; signature: SignatureStatus; documents: number } | null;
};

export const canConvert = (o: Opportunity) => o.salesQualified && !o.pq;

export function rupiah(n: number | null | undefined, period?: string | null) {
  if (n == null) return "";
  return `Rp ${n.toLocaleString("id-ID")}${period ? PERIOD_SUFFIX[period] ?? "" : ""}`;
}

/** Value a filter, sort or search reads for a field: labels for coded fields, so a person filters by what they see. */
export function fieldValue(o: Opportunity, key: string): unknown {
  switch (key) {
    case "status": return STAGE_LABEL[o.status] ?? o.status;
    case "serviceType": return o.serviceType ? SERVICE_LABEL[o.serviceType] ?? o.serviceType : "";
    case "clientType": return o.clientType ? CLIENT_TYPE_LABEL[o.clientType] ?? o.clientType : "";
    case "level": return o.level ? LEVEL_LABEL[o.level] ?? o.level : "";
    case "converted": return o.pq != null;
    default: {
      const v = (o as Record<string, unknown>)[key];
      return v ?? "";
    }
  }
}

export function matchesSearch(o: Opportunity, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [o.optyNo, o.leadNo, o.client, o.position, o.salesPic, o.requirement, o.detailRequirement, o.progressNotes,
    o.requisition?.no, o.pq?.no, fieldValue(o, "status"), fieldValue(o, "serviceType")]
    .some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
}

// ── URL state ────────────────────────────────────────────────────────────────────────────────────────────────
export const VIEWS = ["table", "grid", "kanban"] as const;
export type View = (typeof VIEWS)[number];
/** A page opens on its board (QA 2026-10-08, every Sales V2 page); a plain URL stays plain. */
export const DEFAULT_VIEW: View = "kanban";

export type WorkspaceState = {
  view: View;
  q: string;
  filters: ToolbarFilter[];
  sorts: ToolbarSort[];
  record: string | null;
  savedView: string | null;
};

/** Fields a filter or sort may name. Anything else in a URL is dropped rather than trusted. */
export const FIELD_KEYS = new Set([
  "client", "optyNo", "leadNo", "status", "serviceType", "clientType", "position", "level", "headcount", "salesQualified",
  "price", "closingPrice", "salesPic", "lastCommunication", "bante", "converted", "createdAt", "durationMonths",
  "requirement", "detailRequirement", "progressNotes", "droppedReason",
]);

function parseFilters(raw: string | null, keys: ReadonlySet<string>): ToolbarFilter[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.slice(0, 60).flatMap((f, i): ToolbarFilter[] => {
      if (!f || typeof f !== "object" || !keys.has(f.key)) return [];
      return [{
        id: typeof f.id === "string" ? f.id.slice(0, 40) : `f${i}`,
        key: f.key,
        op: typeof f.op === "string" ? f.op : undefined,
        value: typeof f.value === "string" ? f.value.slice(0, 200) : "",
        ...(Array.isArray(f.values) ? { values: f.values.filter((v: unknown): v is string => typeof v === "string").slice(0, 500) } : {}),
        ...(f.join === "or" || f.join === "and" ? { join: f.join } : {}),
        ...(typeof f.group === "string" ? { group: f.group.slice(0, 40) } : {}),
      } as ToolbarFilter];
    });
  } catch {
    return [];
  }
}

/** `keys`: the fields this page's filters and sorts may name (Opportunity Tracker's by default). */
export function parseState(params: URLSearchParams, keys: ReadonlySet<string> = FIELD_KEYS): WorkspaceState {
  const view = params.get("view");
  const sorts = (params.get("sort") ?? "").split(",").flatMap((s): ToolbarSort[] => {
    const [key, dir] = s.split(":");
    return keys.has(key) && (dir === "asc" || dir === "desc") ? [{ key, dir }] : [];
  });
  return {
    view: (VIEWS as readonly string[]).includes(view ?? "") ? (view as View) : DEFAULT_VIEW,
    q: (params.get("q") ?? "").slice(0, 200),
    filters: parseFilters(params.get("filter"), keys),
    sorts,
    record: params.get("record"),
    savedView: params.get("sv"),
  };
}

/** Query string for a state; defaults are left out so a plain URL stays plain. */
export function serializeState(s: WorkspaceState): string {
  const p = new URLSearchParams();
  if (s.view !== DEFAULT_VIEW) p.set("view", s.view);
  if (s.q.trim()) p.set("q", s.q);
  if (s.filters.length) p.set("filter", JSON.stringify(s.filters.map(({ id, key, op, value, values, join, group }) => ({ id, key, op, value, values, join, group }))));
  if (s.sorts.length) p.set("sort", s.sorts.map((x) => `${x.key}:${x.dir}`).join(","));
  if (s.savedView) p.set("sv", s.savedView);
  if (s.record) p.set("record", s.record);
  const str = p.toString();
  return str ? `?${str}` : "";
}

// ── Header (Excel-style) value filters ──────────────────────────────────────────────────────────────────────
// A column's checklist is stored as ordinary toolbar filters with ids starting `h:<key>`, so it also shows as a chip in
// the toolbar, lives in the URL and applies to every view. Whichever side is shorter is written: the ticked values
// (`isanyof`) or each unticked one (`isnot`; `notempty` for the blank value). That keeps "all but two clients" short.
const headerId = (key: string) => `h:${key}`;
export const isHeaderFilter = (f: ToolbarFilter, key: string) => f.id === headerId(key) || f.id.startsWith(`${headerId(key)}:`);

/** Values of `key` currently ticked in its header checklist. */
export function checkedValues(filters: ToolbarFilter[], key: string, all: string[]): Set<string> {
  const own = filters.filter((f) => isHeaderFilter(f, key));
  const included = own.find((f) => f.op === "isanyof")?.values;
  const excluded = new Set(own.flatMap((f) => (f.op === "isnot" ? [f.value.toLowerCase()] : f.op === "notempty" ? [""] : [])));
  return new Set(all.filter((v) => (!included || included.some((x) => x.toLowerCase() === v.toLowerCase())) && !excluded.has(v.toLowerCase())));
}

/** Replace `key`'s header checklist filters so exactly `checked` (out of `all`) passes. */
export function setCheckedValues(filters: ToolbarFilter[], key: string, all: string[], checked: Set<string>): ToolbarFilter[] {
  const rest = filters.filter((f) => !isHeaderFilter(f, key));
  const on = all.filter((v) => checked.has(v));
  const off = all.filter((v) => !checked.has(v));
  if (!off.length) return rest;
  // The URL keeps at most 60 filters (parseFilters), so a long exclusion list falls back to the ticked values.
  if (off.length > 40 || on.length <= off.length) return [...rest, { id: headerId(key), key, op: "isanyof", value: "", values: on }];
  return [...rest, ...off.map((v, i): ToolbarFilter => (v === "" ? { id: `${headerId(key)}:${i}`, key, op: "notempty", value: "" } : { id: `${headerId(key)}:${i}`, key, op: "isnot", value: v }))];
}

/** Replace `key`'s header range filters (number: greaterthan/lessthan, date: after/before). Blank bounds are dropped. */
export function setRange(filters: ToolbarFilter[], key: string, kind: "number" | "date", min: string, max: string): ToolbarFilter[] {
  const rest = filters.filter((f) => !isHeaderFilter(f, key));
  const [lo, hi] = kind === "number" ? (["greaterthan", "lessthan"] as const) : (["after", "before"] as const);
  return [
    ...rest,
    ...(min.trim() ? [{ id: `${headerId(key)}:min`, key, op: lo, value: min.trim() } as ToolbarFilter] : []),
    ...(max.trim() ? [{ id: `${headerId(key)}:max`, key, op: hi, value: max.trim() } as ToolbarFilter] : []),
  ];
}

/** Replace `key`'s header text filter (`contains`). */
export function setContains(filters: ToolbarFilter[], key: string, text: string): ToolbarFilter[] {
  const rest = filters.filter((f) => !isHeaderFilter(f, key));
  return text.trim() ? [...rest, { id: headerId(key), key, op: "contains", value: text.trim().slice(0, 200) }] : rest;
}

// ── Saved views ──────────────────────────────────────────────────────────────────────────────────────────────
export type SavedState = Pick<WorkspaceState, "view" | "q" | "filters" | "sorts"> & { shownKeys?: string[] };
export type StoredView = { id: string; name: string; state: SavedState; builtIn?: boolean };

const OPEN_STAGES = ["CV Submission", "Solutioning", "Proposal Sent", "Need Action"];
export const BUILT_IN_VIEWS: StoredView[] = [
  { id: "all", name: "Semua Opportunity", builtIn: true, state: { view: "table", q: "", filters: [], sorts: [] } },
  { id: "active", name: "Pipeline aktif", builtIn: true, state: { view: "kanban", q: "", filters: [{ id: "b1", key: "status", op: "isanyof", value: "", values: OPEN_STAGES }], sorts: [] } },
  { id: "ready", name: "Siap Convert", builtIn: true, state: { view: "table", q: "", filters: [{ id: "b2", key: "salesQualified", op: "istrue", value: "" }, { id: "b3", key: "converted", op: "isfalse", value: "" }], sorts: [] } },
  { id: "win", name: "Win", builtIn: true, state: { view: "table", q: "", filters: [{ id: "b4", key: "status", op: "is", value: "Win" }], sorts: [] } },
  { id: "dropped", name: "Dropped", builtIn: true, state: { view: "table", q: "", filters: [{ id: "b5", key: "status", op: "is", value: "Dropped" }], sorts: [] } },
];

/**
 * The V1 edit form's fields (app/sales/opportunity-tracker/[id]/edit) for a record, as form strings. The edit dialog
 * starts from these, and a Kanban move that also records a Dropped Reason sends them back unchanged through the same
 * V1 action (updateOpportunityTracker), so every other field keeps its value. Blank means "not set" (the action
 * stores null), exactly as the V1 form posts it.
 */
export function editValues(o: Opportunity): Record<string, string> {
  const s = (v: unknown) => (v == null ? "" : String(v));
  return {
    client_name: o.client, client_type_code: s(o.clientType), service_type_code: s(o.serviceType), sales_pic_name: o.salesPic,
    position_name: s(o.position), level_code: s(o.level), headcount_target: s(o.headcount), estimated_duration_months: s(o.durationMonths),
    price_amount: s(o.price), price_period_code: s(o.pricePeriod), estimated_deal_amount: s(o.closingPrice), bante_score: s(o.bante),
    last_communication_date: s(o.lastCommunication), sales_qualified: o.salesQualified ? "true" : "", opty_status_code: o.status,
    requirement_summary: s(o.requirement), detail_requirement: s(o.detailRequirement), progress_notes: s(o.progressNotes), dropped_reason: s(o.droppedReason),
  };
}

/** Days since a yyyy-mm-dd date (Last Communication age on cards); null when unknown. */
export function daysSince(date: string | null, now = Date.now()): number | null {
  if (!date) return null;
  const t = Date.parse(date + "T00:00:00+07:00");
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 86400000));
}

/** Default columns: every field, as V1 and Attio show them; daily ones first. Hide any from a header or "Kolom". */
export const DEFAULT_SHOWN = [
  "client", "optyNo", "status", "position", "headcount", "price", "salesPic", "salesQualified", "lastCommunication", "downstream",
  "leadNo", "clientType", "serviceType", "level", "durationMonths", "requirement", "detailRequirement", "closingPrice", "bante", "progressNotes", "droppedReason",
];

// ── Inline edits (QA 2026-10-08) ─────────────────────────────────────────────────────────────────────────────
type FieldEdit<T> = { form: string; required?: boolean; patch: (value: string) => Partial<T> };
/** Digits only (a pasted "Rp 7.000.000" is 7000000); blank stays blank. */
export const digits = (v: string) => v.replace(/[^\d]/g, "");
const num = (v: string) => (digits(v) ? Number(digits(v)) : null);
const text = (v: string) => (v.trim() ? v.trim() : null);
const NUMERIC_FORM_FIELDS = new Set(["headcount_target", "estimated_duration_months", "price_amount", "estimated_deal_amount", "bant_score", "bante_score"]);

/** Table column → the V1 edit form field it writes, and the record change it makes. Stage and Sales Qualified have
 *  their own V1 actions and are not here. Required as in the V1 form. */
export const OT_FIELD_EDITS: Record<string, FieldEdit<Opportunity>> = {
  client: { form: "client_name", required: true, patch: (v) => ({ client: v.trim() }) },
  salesPic: { form: "sales_pic_name", required: true, patch: (v) => ({ salesPic: v.trim() }) },
  clientType: { form: "client_type_code", patch: (v) => ({ clientType: text(v) }) },
  serviceType: { form: "service_type_code", patch: (v) => ({ serviceType: text(v) }) },
  position: { form: "position_name", patch: (v) => ({ position: text(v) }) },
  level: { form: "level_code", patch: (v) => ({ level: text(v) }) },
  headcount: { form: "headcount_target", patch: (v) => ({ headcount: num(v) }) },
  durationMonths: { form: "estimated_duration_months", patch: (v) => ({ durationMonths: num(v) }) },
  price: { form: "price_amount", patch: (v) => ({ price: num(v) }) },
  closingPrice: { form: "estimated_deal_amount", patch: (v) => ({ closingPrice: num(v) }) },
  bante: { form: "bante_score", patch: (v) => ({ bante: num(v) }) },
  lastCommunication: { form: "last_communication_date", patch: (v) => ({ lastCommunication: text(v) }) },
  requirement: { form: "requirement_summary", patch: (v) => ({ requirement: text(v) }) },
  detailRequirement: { form: "detail_requirement", patch: (v) => ({ detailRequirement: text(v) }) },
  progressNotes: { form: "progress_notes", patch: (v) => ({ progressNotes: text(v) }) },
  droppedReason: { form: "dropped_reason", patch: (v) => ({ droppedReason: text(v) }) },
};

/** The full V1 form for one changed field: every other field posted as it is, so the V1 action keeps them. */
export function fieldFormData(values: Record<string, string>, form: string, value: string): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...values, [form]: NUMERIC_FORM_FIELDS.has(form) ? digits(value) : value.trim() })) fd.set(k, v);
  return fd;
}
