// Sales V2 Account (CRM) view model: crm_clients rows with their contacts, activities and the V1 Account 360 stats
// and history (lib/crm.ts), in the shape the shared workspace reads. Pure: no React, no database, so it is tested
// directly (tests/sales-v2.test.ts). Statuses and activity types are V1's (app/sales/accounts).
import type { RelatedHistory } from "@/lib/crm";
import type { StoredView } from "./model";

export const ACCOUNT_STATUSES = [
  { id: "prospect", title: "Prospect", swatch: 9, accent: "#f59e0b" },
  { id: "active", title: "Active", swatch: 5, accent: "#10b981" },
  { id: "dormant", title: "Dormant", swatch: 7, accent: "#8a8f98" },
] as const;
export const ACCOUNT_STATUS_LABEL: Record<string, string> = Object.fromEntries(ACCOUNT_STATUSES.map((s) => [s.id, s.title]));
export const ACTIVITY_TYPES = [["call", "Call"], ["email", "Email"], ["meeting", "Meeting"], ["note", "Note"]] as const;
export const ACTIVITY_LABEL: Record<string, string> = Object.fromEntries(ACTIVITY_TYPES);

export type Contact = { id: string; name: string; role: string | null; email: string | null; phone: string | null; primary: boolean };
export type Activity = { id: string; type: string; title: string; description: string | null; date: string; contact: string | null; by: string | null };

export type Account = {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: string | null;
  // V1 stats (getAccountStatsMap): matched to leads / PQ / contracts / invoices by client name.
  leads: number;
  opportunities: number;
  activeOpportunities: number;
  contracts: number;
  monthlyValue: number;
  invoices: number;
  overdueInvoices: number;
  /** Primary first, as V1 lists them. */
  contacts: Contact[];
  /** Newest first. */
  activities: Activity[];
  /** Mail stored for the account (crm_emails); the panel's Email section loads them when opened. */
  emails: number;
  history: RelatedHistory;
};

/** The contact a list shows for an account: the primary one, else the first. */
export const picOf = (a: Account) => a.contacts[0] ?? null;
export const lastActivityOf = (a: Account) => a.activities[0]?.date ?? null;

/** Value a filter, sort or search reads for a field: labels for coded fields, so a person filters by what they see. */
export function accountFieldValue(a: Account, key: string): unknown {
  switch (key) {
    case "status": return ACCOUNT_STATUS_LABEL[a.status] ?? a.status;
    case "pic": return picOf(a)?.name ?? "";
    case "contactCount": return a.contacts.length;
    case "activityCount": return a.activities.length;
    case "lastActivity": return lastActivityOf(a) ?? "";
    case "hasActiveOpty": return a.activeOpportunities > 0;
    case "hasOverdue": return a.overdueInvoices > 0;
    default: {
      const v = (a as Record<string, unknown>)[key];
      return v ?? "";
    }
  }
}

export function accountMatchesSearch(a: Account, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [a.name, a.industry, a.notes, ACCOUNT_STATUS_LABEL[a.status], ...a.contacts.flatMap((c) => [c.name, c.email, c.phone])]
    .some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
}

/** Fields a URL filter or sort may name on this page. */
export const ACCOUNT_FIELD_KEYS = new Set([
  "name", "status", "industry", "activeOpportunities", "opportunities", "leads", "contracts", "monthlyValue", "invoices",
  "overdueInvoices", "pic", "contactCount", "lastActivity", "activityCount", "notes", "createdBy", "createdAt", "hasActiveOpty", "hasOverdue",
]);

const view = (id: string, name: string, filters: StoredView["state"]["filters"] = []): StoredView => ({ id, name, builtIn: true, state: { view: "table", q: "", filters, sorts: [] } });
export const ACCOUNT_BUILT_IN_VIEWS: StoredView[] = [
  view("all", "Semua Account"),
  view("prospect", "Perlu Follow-up", [{ id: "b1", key: "status", op: "is", value: "Prospect" }]),
  view("active", "Active", [{ id: "b2", key: "status", op: "is", value: "Active" }]),
  view("dormant", "Dormant", [{ id: "b3", key: "status", op: "is", value: "Dormant" }]),
  view("active_opty", "Ada Opportunity Aktif", [{ id: "b4", key: "hasActiveOpty", op: "istrue", value: "" }]),
  view("overdue", "Invoice Overdue", [{ id: "b5", key: "hasOverdue", op: "istrue", value: "" }]),
];

/** Default columns: Account first and pinned, then what V1's cards and Account 360 show. */
export const ACCOUNT_DEFAULT_SHOWN = [
  "name", "status", "industry", "activeOpportunities", "opportunities", "leads", "contracts", "monthlyValue", "invoices",
  "overdueInvoices", "pic", "contactCount", "lastActivity", "activityCount", "notes", "createdBy", "createdAt",
];

/** V1's updateClient writes name, industry, status and notes together; a status change posts the others unchanged. */
export function accountFormData(a: Account, status = a.status): FormData {
  const fd = new FormData();
  fd.set("name", a.name);
  fd.set("industry", a.industry ?? "");
  fd.set("status_code", status);
  fd.set("notes", a.notes ?? "");
  return fd;
}
