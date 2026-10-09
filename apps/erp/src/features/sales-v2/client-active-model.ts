// Sales V2 Client Active view model: TA applications (candidate + requisition) with their status at the client, in the
// shape the shared workspace reads. Same rows, statuses and labels as V1 (app/ta/client-active). Pure: no React, no
// database, so it is tested directly (tests/sales-v2.test.ts).
import { CLIENT_SUBMISSION_STATUSES } from "@/app/ta/client-active/constants";
import { HIRING_STATUS_LABELS } from "@/app/ta/pipeline/hiring-status";
import type { StoredView } from "./model";

/** "Belum dikirim" first (no status yet, V1's "Not sent to client"), then V1's statuses in their order. */
const ACCENT: Record<string, string> = {
  not_sent: "#8a8f98", sent_to_client: "#3b82f6", client_reviewing: "#6366f1", client_interview: "#f59e0b",
  client_accepted: "#10b981", client_rejected: "#ef4444", on_hold: "#64748b",
};
const SWATCH: Record<string, 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12> = {
  not_sent: 7, sent_to_client: 10, client_reviewing: 11, client_interview: 9, client_accepted: 5, client_rejected: 8, on_hold: 7,
};
export const NOT_SENT = "not_sent";
export const CLIENT_STATUSES = [["not_sent", "Belum dikirim"], ...CLIENT_SUBMISSION_STATUSES].map(([id, title]) => ({
  id, title, accent: ACCENT[id], swatch: SWATCH[id],
}));
export const CLIENT_STATUS_LABEL: Record<string, string> = Object.fromEntries(CLIENT_STATUSES.map((s) => [s.id, s.title]));
export { HIRING_STATUS_LABELS };

export type ClientCandidate = {
  id: string; // the application
  candidateNo: string | null;
  name: string;
  wa: string | null;
  email: string | null;
  level: string | null;
  hiringStatus: string;
  price: number | null;
  /** V1's client_submission_status_code; `not_sent` when none. */
  clientStatus: string;
  clientNote: string | null;
  clientUpdatedAt: string | null;
  clientUpdatedBy: string | null;
  client: string;
  position: string | null;
  createdAt: string | null;
};

export const NO_CLIENT = "Tanpa client";

/** Value a filter, sort or search reads for a field: labels for coded fields, so a person filters by what they see. */
export function clientFieldValue(c: ClientCandidate, key: string): unknown {
  switch (key) {
    case "clientStatus": return CLIENT_STATUS_LABEL[c.clientStatus] ?? c.clientStatus;
    case "hiringStatus": return HIRING_STATUS_LABELS[c.hiringStatus] ?? c.hiringStatus;
    case "sent": return c.clientStatus !== NOT_SENT;
    default: {
      const v = (c as Record<string, unknown>)[key];
      return v ?? "";
    }
  }
}

/** V1's search: candidate no, name, position, WA, email (plus the client, since V2 is one list). */
export function clientMatchesSearch(c: ClientCandidate, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [c.candidateNo, c.name, c.position, c.wa, c.email, c.client].some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
}

export const CLIENT_FIELD_KEYS = new Set([
  "client", "candidateNo", "name", "position", "level", "wa", "email", "price", "hiringStatus", "clientStatus", "clientNote",
  "clientUpdatedBy", "clientUpdatedAt", "createdAt", "sent",
]);

const view = (id: string, name: string, filters: StoredView["state"]["filters"] = []): StoredView => ({ id, name, builtIn: true, state: { view: "table", q: "", filters, sorts: [] } });
const status = (n: number, title: string) => ({ id: `b${n}`, key: "clientStatus", op: "is" as const, value: title });
export const CLIENT_BUILT_IN_VIEWS: StoredView[] = [
  view("all", "Semua kandidat"),
  view("not_sent", "Belum dikirim", [status(1, "Belum dikirim")]),
  view("interview", "Client Interview", [status(2, "Client Interview")]),
  view("accepted", "Client Accepted", [status(3, "Client Accepted")]),
  view("sent", "Sudah dikirim", [{ id: "b4", key: "sent", op: "istrue", value: "" }]),
];

/** V1's columns, in V1's order, with the client first (V1 groups by it). */
export const CLIENT_DEFAULT_SHOWN = [
  "client", "candidateNo", "name", "position", "level", "wa", "email", "price", "hiringStatus", "clientStatus", "clientNote", "clientUpdatedBy", "clientUpdatedAt",
];

/** V1's updateClientSubmissionStatus posts the status and the note together. */
export function clientStatusForm(c: ClientCandidate, patch: { status?: string; note?: string | null }): FormData {
  const fd = new FormData();
  const s = patch.status ?? c.clientStatus;
  fd.set("client_submission_status_code", s === NOT_SENT ? "" : s);
  fd.set("client_submission_note", (patch.note !== undefined ? patch.note : c.clientNote) ?? "");
  return fd;
}
