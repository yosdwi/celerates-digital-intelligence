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
]);

function parseFilters(raw: string | null): ToolbarFilter[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.slice(0, 20).flatMap((f, i): ToolbarFilter[] => {
      if (!f || typeof f !== "object" || !FIELD_KEYS.has(f.key)) return [];
      return [{
        id: typeof f.id === "string" ? f.id.slice(0, 40) : `f${i}`,
        key: f.key,
        op: typeof f.op === "string" ? f.op : undefined,
        value: typeof f.value === "string" ? f.value.slice(0, 200) : "",
        ...(Array.isArray(f.values) ? { values: f.values.filter((v: unknown): v is string => typeof v === "string").slice(0, 20) } : {}),
        ...(f.join === "or" || f.join === "and" ? { join: f.join } : {}),
        ...(typeof f.group === "string" ? { group: f.group.slice(0, 40) } : {}),
      } as ToolbarFilter];
    });
  } catch {
    return [];
  }
}

export function parseState(params: URLSearchParams): WorkspaceState {
  const view = params.get("view");
  const sorts = (params.get("sort") ?? "").split(",").flatMap((s): ToolbarSort[] => {
    const [key, dir] = s.split(":");
    return FIELD_KEYS.has(key) && (dir === "asc" || dir === "desc") ? [{ key, dir }] : [];
  });
  return {
    view: (VIEWS as readonly string[]).includes(view ?? "") ? (view as View) : "table",
    q: (params.get("q") ?? "").slice(0, 200),
    filters: parseFilters(params.get("filter")),
    sorts,
    record: params.get("record"),
    savedView: params.get("sv"),
  };
}

/** Query string for a state; defaults are left out so a plain URL stays plain. */
export function serializeState(s: WorkspaceState): string {
  const p = new URLSearchParams();
  if (s.view !== "table") p.set("view", s.view);
  if (s.q.trim()) p.set("q", s.q);
  if (s.filters.length) p.set("filter", JSON.stringify(s.filters.map(({ id, key, op, value, values, join, group }) => ({ id, key, op, value, values, join, group }))));
  if (s.sorts.length) p.set("sort", s.sorts.map((x) => `${x.key}:${x.dir}`).join(","));
  if (s.savedView) p.set("sv", s.savedView);
  if (s.record) p.set("record", s.record);
  const str = p.toString();
  return str ? `?${str}` : "";
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

/** Default columns: what a Sales person works with daily. Every other field stays one click away in View settings. */
export const DEFAULT_SHOWN = ["client", "optyNo", "status", "position", "headcount", "price", "salesPic", "salesQualified", "lastCommunication", "downstream"];
