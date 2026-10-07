// Sales V2 PQ Tracker view model: PQ Tracker rows (table `opportunities`) in the shape the shared workspace reads.
// Pure: no React, no database, so it is tested directly (tests/sales-v2.test.ts). Stages, Opty Status and the
// stage → status rule are V1's own (app/sales/pq-constants.ts).
import { OPTY_STATUS, STAGE_TO_OPTY_STATUS } from "@/app/sales/pq-constants";
import type { StoredView } from "./model";
import { BUSINESS_UNITS, CLIENT_TYPE_LABEL, LEVEL_LABEL, PRIORITIES, SERVICE_LABEL, type SignatureStatus } from "./model";

// Board order: work in progress first, closed last. `swatch` is Crisp's tag palette (see model.ts STAGES).
export const PQ_STAGES = [
  { id: "on_going", title: "On Going", swatch: 10, accent: "#3b82f6" },
  { id: "hold", title: "Hold", swatch: 9, accent: "#f59e0b" },
  { id: "win", title: "Win", swatch: 5, accent: "#10b981" },
  { id: "drop", title: "Drop", swatch: 8, accent: "#ef4444" },
] as const;
export const PQ_STAGE_LABEL: Record<string, string> = Object.fromEntries(PQ_STAGES.map((s) => [s.id, s.title]));
export const OPTY_STATUS_LABEL: Record<string, string> = Object.fromEntries(OPTY_STATUS);
export const BU_LABEL: Record<string, string> = Object.fromEntries(BUSINESS_UNITS);
export const PRIORITY_LABEL: Record<string, string> = Object.fromEntries(PRIORITIES);
export const LEAD_SOURCE_LABEL: Record<string, string> = { linkedin: "LinkedIn", ads: "Ads", referral: "Referral", existing: "Existing", website: "Website" };
export const SIGNATURE_LABEL: Record<SignatureStatus, string> = { not_sent: "Belum dikirim", pending: "Menunggu TTD", signed: "Ditandatangani", rejected: "Ditolak" };

export type PqFile = { id: string; name: string; url: string | null; kind: "file" | "link" };
/** The PMO Document Tracker row for this PQ (project_documents), edited from the PQ form too. */
export type ProjectDoc = {
  projectDetails: string | null; salesType: string | null;
  pksNo: string | null; pksStatus: string | null; poNo: string | null; poStatus: string | null;
  crNo: string | null; crStatus: string | null; otherDocNo: string | null; otherDocStatus: string | null;
};

export type Pq = {
  id: string;
  optyNo: string;
  pqNo: string | null;
  /** Set when TA onboarding created this row; without a PQ No it then needs one generated (V1 "Perlu Generate PQ"). */
  fromOnboarding: boolean;
  trackerId: string | null;
  client: string;
  clientType: string | null;
  project: string;
  position: string | null;
  serviceType: string;
  businessUnit: string | null;
  level: string | null;
  headcount: number | null;
  durationMonths: number | null;
  priority: string | null;
  bant: number | null;
  price: number | null;
  pricePeriod: string | null;
  requestDate: string | null;
  approvalDate: string | null;
  startDate: string | null;
  endDate: string | null;
  salesPic: string;
  stage: string;
  optyStatus: string | null;
  notes: string | null;
  leadSource: string | null;
  createdAt: string | null;
  poDocUrl: string | null;
  poDocs: PqFile[];
  pqDocs: PqFile[];
  signature: { status: SignatureStatus; signerName: string | null };
  projectDoc: ProjectDoc | null;
};

export const needsPqNo = (p: Pq) => !p.pqNo && p.fromOnboarding;

/** The optimistic change a stage move makes: V1 also sets the matching Opty Status (Win → Project Won, …). */
export const withPqStage = (p: Pq, to: string): Partial<Pq> => ({ stage: to, optyStatus: STAGE_TO_OPTY_STATUS[to] ?? p.optyStatus });

const coded = (labels: Record<string, string>, v: string | null) => (v ? labels[v] ?? v : "");

/** Value a filter, sort or search reads for a field: labels for coded fields, so a person filters by what they see. */
export function pqFieldValue(p: Pq, key: string): unknown {
  switch (key) {
    case "stage": return PQ_STAGE_LABEL[p.stage] ?? p.stage;
    case "optyStatus": return coded(OPTY_STATUS_LABEL, p.optyStatus);
    case "signature": return SIGNATURE_LABEL[p.signature.status];
    case "serviceType": return coded(SERVICE_LABEL, p.serviceType);
    case "clientType": return coded(CLIENT_TYPE_LABEL, p.clientType);
    case "level": return coded(LEVEL_LABEL, p.level);
    case "businessUnit": return coded(BU_LABEL, p.businessUnit);
    case "priority": return coded(PRIORITY_LABEL, p.priority);
    case "leadSource": return coded(LEAD_SOURCE_LABEL, p.leadSource);
    case "needPq": return needsPqNo(p);
    case "pqDocs": return p.pqDocs.length;
    case "poDocs": return p.poDocs.length + (p.poDocUrl ? 1 : 0);
    default: {
      const v = (p as Record<string, unknown>)[key];
      return v ?? "";
    }
  }
}

export function pqMatchesSearch(p: Pq, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [p.optyNo, p.pqNo, p.client, p.project, p.position, p.salesPic, p.notes, pqFieldValue(p, "stage"), pqFieldValue(p, "optyStatus")]
    .some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
}

/** Fields a URL filter or sort may name on this page. */
export const PQ_FIELD_KEYS = new Set([
  "client", "optyNo", "pqNo", "stage", "optyStatus", "signature", "project", "position", "clientType", "serviceType", "businessUnit",
  "level", "headcount", "durationMonths", "priority", "bant", "price", "approvalDate", "salesPic", "leadSource", "requestDate",
  "startDate", "endDate", "notes", "needPq", "createdAt", "pqDocs", "poDocs",
]);

export const PQ_BUILT_IN_VIEWS: StoredView[] = [
  { id: "all", name: "Semua PQ", builtIn: true, state: { view: "table", q: "", filters: [], sorts: [] } },
  { id: "on_going", name: "On Going", builtIn: true, state: { view: "table", q: "", filters: [{ id: "b1", key: "stage", op: "is", value: "On Going" }], sorts: [] } },
  { id: "need_pq", name: "Perlu Generate PQ", builtIn: true, state: { view: "table", q: "", filters: [{ id: "b2", key: "needPq", op: "istrue", value: "" }], sorts: [] } },
  { id: "win", name: "Win", builtIn: true, state: { view: "table", q: "", filters: [{ id: "b3", key: "stage", op: "is", value: "Win" }], sorts: [] } },
  { id: "drop", name: "Drop", builtIn: true, state: { view: "table", q: "", filters: [{ id: "b4", key: "stage", op: "is", value: "Drop" }], sorts: [] } },
];

/** Default columns: every V1 column (Aksi becomes the record panel), Client first and pinned. */
export const PQ_DEFAULT_SHOWN = [
  "client", "optyNo", "pqNo", "stage", "optyStatus", "signature", "pqDocs", "project", "position", "clientType", "serviceType",
  "businessUnit", "level", "headcount", "durationMonths", "priority", "bant", "price", "approvalDate", "poDocs", "salesPic",
  "leadSource", "requestDate", "startDate", "endDate", "notes",
];

/**
 * The V1 edit form's fields (app/sales/[id]/edit) for a record, as form strings: the edit dialog starts from these.
 * V1's update writes every one of them (blank = null), the PMO document fields included, so none may be left out.
 */
export function pqEditValues(p: Pq): Record<string, string> {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const d = p.projectDoc;
  return {
    client_name: p.client, client_type_code: s(p.clientType), project_name: p.project, position_name: s(p.position),
    service_type_code: p.serviceType, business_unit_code: s(p.businessUnit), level_code: s(p.level), headcount_target: s(p.headcount),
    estimated_duration_months: s(p.durationMonths), priority_code: s(p.priority), bant_score: s(p.bant), price_amount: s(p.price),
    price_period_code: p.pricePeriod || "monthly", sales_pic_name: p.salesPic, pq_no: s(p.pqNo), opty_request_date: s(p.requestDate),
    approval_date: s(p.approvalDate), po_doc_url: s(p.poDocUrl), start_date: s(p.startDate), end_date: s(p.endDate), notes: s(p.notes),
    project_details: s(d?.projectDetails), sales_type_code: s(d?.salesType), pks_no: s(d?.pksNo), pks_status_code: s(d?.pksStatus),
    po_no: s(d?.poNo), po_status_code: s(d?.poStatus), cr_no: s(d?.crNo), cr_status_code: s(d?.crStatus),
    other_doc_no: s(d?.otherDocNo), other_doc_status_code: s(d?.otherDocStatus),
  };
}
