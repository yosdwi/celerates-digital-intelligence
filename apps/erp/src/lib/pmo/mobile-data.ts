// PMO mobile read models (doc 18 §16). Read-only views over the existing PMO records: A.Contract
// (project_contracts), Billing Schedule (project_monthly_billings), TM Invoice (project_invoices + BAST),
// Document Tracker (project_documents) and the PMO → Finance handoff (finance_document_handoffs).
// No new business state: statuses are the stored ones, plus the existing derived submission rule.
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  employees,
  financeDocumentHandoffs,
  opportunities,
  projectContracts,
  projectDocuments,
  projectInvoices,
  projectMonthlyBillings,
  talentAssignments,
} from "@/db/schema";
import { invoiceStatusExpression } from "@/lib/invoice-status";
import { getAttachmentsWithUrls, getAttachmentsWithUrlsForMany, type AttachmentWithUrl } from "@/lib/attachments";
import { INVOICE_BAST_DOC_SOURCE, INVOICE_ISSUE_LABELS, PROJECT_DOC_SOURCES } from "@/app/pmo/constants";

export type Tone = "ok" | "warn" | "accent" | "muted" | "danger";
export type ContractStatus = "upcoming" | "active" | "ending" | "ended" | "undated";
export type FollowUp = { key: string; tone: Tone; count?: number } | null;

/** Today in Asia/Jakarta as YYYY-MM-DD (the ERP's business calendar). */
export function jakartaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const DAY = 86_400_000;
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / DAY);
}

/** Contract state from its own dates only. "ending" = ends within 30 days. */
export function contractStatus(start: string | null, end: string | null, today: string): ContractStatus {
  if (!start && !end) return "undated";
  if (start && today < start) return "upcoming";
  if (end && today > end) return "ended";
  if (end && daysBetween(today, end) <= 30) return "ending";
  return "active";
}

export function contractProgress(start: string | null, end: string | null, today: string): number | null {
  if (!start || !end) return null;
  const total = daysBetween(start, end);
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((daysBetween(start, today) / total) * 100)));
}

export type HandoffStatus = "pending" | "notified" | "received" | "needs_revision";

type InvoiceState = { opportunity_id: string; status: string | null; month: string | null };

/** The most important open follow-up for a project, in the order PMO acts on them. */
export function followUpFor(opts: { handoff: string | null; invoices: InvoiceState[]; billingMonths: string[] }): FollowUp {
  if (opts.handoff === "needs_revision") return { key: "financeReturned", tone: "danger" };
  const overdue = opts.invoices.filter((i) => i.status === "overdue").length;
  if (overdue) return { key: "invoicesOverdue", tone: "danger", count: overdue };
  const invoiced = new Set(opts.invoices.map((i) => i.month));
  const missing = opts.billingMonths.filter((m) => !invoiced.has(m)).length;
  if (missing) return { key: "billingWithoutInvoice", tone: "warn", count: missing };
  if (opts.handoff === "notified") return { key: "financeWaiting", tone: "accent" };
  return null;
}

async function projectState(opportunityIds: string[], asOf: Date) {
  if (!opportunityIds.length) return { invoices: [] as InvoiceState[], handoffs: new Map<string, string>(), months: new Map<string, string[]>() };
  const [invoices, handoffs, months] = await Promise.all([
    db
      .select({ opportunity_id: projectInvoices.opportunity_id, status: invoiceStatusExpression(asOf), month: projectInvoices.services_month_start })
      .from(projectInvoices)
      .where(inArray(projectInvoices.opportunity_id, opportunityIds)),
    db
      .select({ opportunity_id: financeDocumentHandoffs.opportunity_id, status: financeDocumentHandoffs.status_code })
      .from(financeDocumentHandoffs)
      .where(inArray(financeDocumentHandoffs.opportunity_id, opportunityIds)),
    db
      .select({ opportunity_id: projectContracts.opportunity_id, month: projectMonthlyBillings.month })
      .from(projectMonthlyBillings)
      .innerJoin(projectContracts, eq(projectMonthlyBillings.contract_id, projectContracts.id))
      .where(inArray(projectContracts.opportunity_id, opportunityIds)),
  ]);
  const monthsBy = new Map<string, string[]>();
  for (const m of months) monthsBy.set(m.opportunity_id, [...(monthsBy.get(m.opportunity_id) ?? []), m.month]);
  return { invoices, handoffs: new Map(handoffs.map((h) => [h.opportunity_id, h.status])), months: monthsBy };
}

export type ContractCard = {
  id: string;
  opty_no: string | null;
  client_name: string | null;
  position_name: string | null;
  project_name: string | null;
  start_date: string | null;
  end_date: string | null;
  months: number | null;
  monthly_value_amount: number | null;
  status: ContractStatus;
  days_left: number | null;
  follow_up: FollowUp;
  search: string;
};

export async function contractCards(now = new Date()): Promise<ContractCard[]> {
  const today = jakartaToday(now);
  const rows = await db
    .select({
      id: projectContracts.id,
      opportunity_id: projectContracts.opportunity_id,
      opty_no: opportunities.opty_no,
      client_name: opportunities.client_name,
      position_name: opportunities.position_name,
      project_name: opportunities.project_name,
      sales_pic_name: opportunities.sales_pic_name,
      start_date: projectContracts.start_date,
      end_date: projectContracts.end_date,
      months: projectContracts.contract_duration_months,
      monthly_value_amount: projectContracts.monthly_value_amount,
    })
    .from(projectContracts)
    .leftJoin(opportunities, eq(projectContracts.opportunity_id, opportunities.id))
    .orderBy(asc(projectContracts.end_date), desc(projectContracts.created_at));
  const state = await projectState([...new Set(rows.map((r) => r.opportunity_id))], now);
  return rows.map((r) => {
    const status = contractStatus(r.start_date, r.end_date, today);
    return {
      id: r.id,
      opty_no: r.opty_no,
      client_name: r.client_name,
      position_name: r.position_name,
      project_name: r.project_name,
      start_date: r.start_date,
      end_date: r.end_date,
      months: r.months,
      monthly_value_amount: r.monthly_value_amount,
      status,
      days_left: r.end_date && status !== "ended" ? daysBetween(today, r.end_date) : null,
      follow_up: followUpFor({
        handoff: state.handoffs.get(r.opportunity_id) ?? null,
        invoices: state.invoices.filter((i) => i.opportunity_id === r.opportunity_id),
        billingMonths: state.months.get(r.opportunity_id) ?? [],
      }),
      search: [r.client_name, r.opty_no, r.position_name, r.project_name, r.sales_pic_name].filter(Boolean).join(" ").toLowerCase(),
    };
  });
}

export async function contractDetail(id: string, now = new Date()) {
  const today = jakartaToday(now);
  const [row] = await db
    .select({
      id: projectContracts.id,
      opportunity_id: projectContracts.opportunity_id,
      monthly_value_amount: projectContracts.monthly_value_amount,
      total_value_amount: projectContracts.total_value_amount,
      months: projectContracts.contract_duration_months,
      start_date: projectContracts.start_date,
      end_date: projectContracts.end_date,
      notes: projectContracts.notes,
      sales_type_code: projectContracts.sales_type_code,
      opty_no: opportunities.opty_no,
      pq_no: opportunities.pq_no,
      client_name: opportunities.client_name,
      project_name: opportunities.project_name,
      position_name: opportunities.position_name,
      service_type_code: opportunities.service_type_code,
      sales_pic_name: opportunities.sales_pic_name,
      headcount_target: opportunities.headcount_target,
    })
    .from(projectContracts)
    .leftJoin(opportunities, eq(projectContracts.opportunity_id, opportunities.id))
    .where(eq(projectContracts.id, id));
  if (!row) return null;
  const [billings, invoices, documents, handoff, talents] = await Promise.all([
    db.select({ month: projectMonthlyBillings.month, amount: projectMonthlyBillings.amount }).from(projectMonthlyBillings).where(eq(projectMonthlyBillings.contract_id, id)).orderBy(asc(projectMonthlyBillings.month)),
    db
      .select({ id: projectInvoices.id, month: projectInvoices.services_month_start, status: invoiceStatusExpression(now), plan: projectInvoices.invoice_plan_date, issue: projectInvoices.issue_code })
      .from(projectInvoices)
      .where(eq(projectInvoices.opportunity_id, row.opportunity_id))
      .orderBy(asc(projectInvoices.services_month_start)),
    db.select().from(projectDocuments).where(eq(projectDocuments.opportunity_id, row.opportunity_id)).orderBy(desc(projectDocuments.created_at)),
    db.select().from(financeDocumentHandoffs).where(eq(financeDocumentHandoffs.opportunity_id, row.opportunity_id)).then((r) => r[0] ?? null),
    db
      .select({ id: talentAssignments.id, employee_no: employees.employee_no, position_name: employees.position_name, status: talentAssignments.status_code, start_date: talentAssignments.start_date, end_date: talentAssignments.end_date })
      .from(talentAssignments)
      .innerJoin(employees, eq(talentAssignments.employee_id, employees.id))
      .where(eq(talentAssignments.pq_tracker_id, row.opportunity_id)),
  ]);
  const docIds = documents.map((d) => d.id);
  const [pks, po, cr, other] = await Promise.all(
    [PROJECT_DOC_SOURCES.pks, PROJECT_DOC_SOURCES.po, PROJECT_DOC_SOURCES.cr, PROJECT_DOC_SOURCES.other].map((source) => getAttachmentsWithUrlsForMany(source, docIds)),
  );
  const invoiceByMonth = new Map(invoices.map((i) => [i.month, i]));
  return {
    ...row,
    status: contractStatus(row.start_date, row.end_date, today),
    progress: contractProgress(row.start_date, row.end_date, today),
    days_left: row.end_date ? daysBetween(today, row.end_date) : null,
    billings: billings.map((b) => ({ ...b, invoice: invoiceByMonth.get(b.month) ?? null })),
    invoices: invoices.map((i) => ({ ...i, issue_label: i.issue ? INVOICE_ISSUE_LABELS[i.issue] ?? i.issue : null })),
    documents: documents.flatMap((d) =>
      (
        [
          ["PKS", d.pks_no, d.pks_url, d.pks_status_code, pks[d.id] ?? []],
          ["PO", d.po_no, d.po_url, d.po_status_code, po[d.id] ?? []],
          ["CR", d.cr_no, d.cr_url, d.cr_status_code, cr[d.id] ?? []],
          ["Lainnya", d.other_doc_no, d.other_doc_url, d.other_doc_status_code, other[d.id] ?? []],
        ] as const
      )
        .filter(([, no, url, status, files]) => no || url || status || files.length)
        .map(([kind, no, url, status, files]) => ({ key: `${d.id}-${kind}`, kind, no, url, status, files: files as AttachmentWithUrl[] })),
    ),
    handoff,
    talents,
    follow_up: followUpFor({
      handoff: handoff?.status_code ?? null,
      invoices: invoices.map((i) => ({ opportunity_id: row.opportunity_id, status: i.status, month: i.month })),
      billingMonths: billings.map((b) => b.month),
    }),
  };
}

export type InvoiceCard = {
  id: string;
  client_name: string | null;
  opty_no: string | null;
  month: string | null;
  plan: string | null;
  status: string | null;
  issue_label: string | null;
  has_bast: boolean;
  handoff: string | null;
  search: string;
};

export async function invoiceCards(now = new Date()): Promise<InvoiceCard[]> {
  const rows = await db
    .select({
      id: projectInvoices.id,
      client_name: opportunities.client_name,
      opty_no: opportunities.opty_no,
      group_name: projectInvoices.group_name,
      month: projectInvoices.services_month_start,
      plan: projectInvoices.invoice_plan_date,
      status: invoiceStatusExpression(now),
      issue: projectInvoices.issue_code,
      bast_url: projectInvoices.bast_support_doc_url,
      handoff: financeDocumentHandoffs.status_code,
    })
    .from(projectInvoices)
    .leftJoin(opportunities, eq(projectInvoices.opportunity_id, opportunities.id))
    .leftJoin(financeDocumentHandoffs, eq(projectInvoices.opportunity_id, financeDocumentHandoffs.opportunity_id))
    .orderBy(desc(projectInvoices.services_month_start), desc(projectInvoices.created_at));
  const bast = await getAttachmentsWithUrlsForMany(INVOICE_BAST_DOC_SOURCE, rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    client_name: r.client_name,
    opty_no: r.opty_no,
    month: r.month,
    plan: r.plan,
    status: r.status,
    issue_label: r.issue ? INVOICE_ISSUE_LABELS[r.issue] ?? r.issue : null,
    has_bast: Boolean(r.bast_url) || (bast[r.id]?.length ?? 0) > 0,
    handoff: r.handoff,
    search: [r.client_name, r.opty_no, r.group_name].filter(Boolean).join(" ").toLowerCase(),
  }));
}

export async function invoiceDetail(id: string, now = new Date()) {
  const [row] = await db
    .select({
      id: projectInvoices.id,
      opportunity_id: projectInvoices.opportunity_id,
      month: projectInvoices.services_month_start,
      plan: projectInvoices.invoice_plan_date,
      group_name: projectInvoices.group_name,
      price_per_month: projectInvoices.price_per_month,
      status: invoiceStatusExpression(now),
      stored_status: projectInvoices.status_code,
      issue: projectInvoices.issue_code,
      submit_bast_date: projectInvoices.submit_bast_date,
      bast_url: projectInvoices.bast_support_doc_url,
      notes: projectInvoices.notes,
      client_name: opportunities.client_name,
      opty_no: opportunities.opty_no,
      position_name: opportunities.position_name,
    })
    .from(projectInvoices)
    .leftJoin(opportunities, eq(projectInvoices.opportunity_id, opportunities.id))
    .where(eq(projectInvoices.id, id));
  if (!row) return null;
  const [bast, handoff, contract] = await Promise.all([
    getAttachmentsWithUrls(INVOICE_BAST_DOC_SOURCE, id),
    db.select().from(financeDocumentHandoffs).where(eq(financeDocumentHandoffs.opportunity_id, row.opportunity_id)).then((r) => r[0] ?? null),
    db
      .select({ id: projectContracts.id, start_date: projectContracts.start_date, end_date: projectContracts.end_date })
      .from(projectContracts)
      .where(and(eq(projectContracts.opportunity_id, row.opportunity_id)))
      .orderBy(desc(projectContracts.end_date))
      .then((r) => r[0] ?? null),
  ]);
  return { ...row, issue_label: row.issue ? INVOICE_ISSUE_LABELS[row.issue] ?? row.issue : null, bast, handoff, contract };
}

/** Finance's view of the PMO → Finance handoff (doc 18 §17): every project PMO has notified, with its latest TM Invoice. */
export async function handoffCards() {
  const rows = await db
    .select({
      id: financeDocumentHandoffs.id,
      opportunity_id: financeDocumentHandoffs.opportunity_id,
      status: financeDocumentHandoffs.status_code,
      notified_at: financeDocumentHandoffs.notified_at,
      notified_by_name: financeDocumentHandoffs.notified_by_name,
      received_at: financeDocumentHandoffs.received_at,
      received_by_name: financeDocumentHandoffs.received_by_name,
      finance_notes: financeDocumentHandoffs.finance_notes,
      client_name: opportunities.client_name,
      opty_no: opportunities.opty_no,
      project_name: opportunities.project_name,
      invoice_id: sql<string | null>`(SELECT pi.id FROM project_invoices pi WHERE pi.opportunity_id = ${financeDocumentHandoffs.opportunity_id} ORDER BY pi.services_month_start DESC NULLS LAST, pi.created_at DESC LIMIT 1)`,
      invoice_count: sql<number>`(SELECT count(*)::int FROM project_invoices pi WHERE pi.opportunity_id = ${financeDocumentHandoffs.opportunity_id})`,
    })
    .from(financeDocumentHandoffs)
    .leftJoin(opportunities, eq(financeDocumentHandoffs.opportunity_id, opportunities.id))
    // Only what PMO has actually handed over ("Kasih tau Finance"), as on the desktop Finance page.
    .where(ne(financeDocumentHandoffs.status_code, "pending"))
    .orderBy(desc(financeDocumentHandoffs.notified_at));
  return rows.map((r) => ({ ...r, search: [r.client_name, r.opty_no, r.project_name, r.notified_by_name].filter(Boolean).join(" ").toLowerCase() }));
}
