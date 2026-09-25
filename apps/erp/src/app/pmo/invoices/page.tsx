import { invoiceStatusExpression } from "@/lib/invoice-status";
import { db } from "@/db";
import { projectInvoices, opportunities, financeDocumentHandoffs, projectContracts, projectMonthlyBillings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { createProjectInvoice, syncBillingScheduleToInvoices } from "../actions";
import { INVOICE_BAST_DOC_SOURCE, INVOICE_ISSUES } from "../constants";
import { OpportunityPicker } from "@/components/opportunity-picker";
import { InvoicesTable } from "./invoices-table";
import { ExpandableSection } from "@/components/expandable-section";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { getAttachmentsWithUrlsForMany } from "@/lib/attachments";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { Receipt, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";

const STATUS_OPTIONS = [["overdue", "Overdue"], ["submitted", "Submitted"], ["planned", "Invoice Plan"], ["canceled", "Canceled"]] as const;

export default async function InvoicesPage() {
  const t = await getTranslations("pmo.invoices");

  const [data, opportunityOptions] = await Promise.all([
    db
      .select({
        id: projectInvoices.id,
        opportunity_id: projectInvoices.opportunity_id,
        opty_no: opportunities.opty_no,
        client_name: opportunities.client_name,
        business_unit_code: opportunities.business_unit_code,
        invoice_plan_date: projectInvoices.invoice_plan_date,
        group_name: projectInvoices.group_name,
        services_month_start: projectInvoices.services_month_start,
        price_per_month: projectInvoices.price_per_month,
        status_code: invoiceStatusExpression(),
        bast_support_doc_url: projectInvoices.bast_support_doc_url,
        notes: projectInvoices.notes,
        issue_code: projectInvoices.issue_code,
        submit_bast_date: projectInvoices.submit_bast_date,
        finance_doc_url: financeDocumentHandoffs.doc_url,
        finance_status_code: financeDocumentHandoffs.status_code,
        finance_notified_at: financeDocumentHandoffs.notified_at,
        finance_notified_by_name: financeDocumentHandoffs.notified_by_name,
        finance_received_at: financeDocumentHandoffs.received_at,
        finance_received_by_name: financeDocumentHandoffs.received_by_name,
        finance_notes: financeDocumentHandoffs.finance_notes,
        created_at: projectInvoices.created_at,
      })
      .from(projectInvoices)
      .leftJoin(opportunities, eq(projectInvoices.opportunity_id, opportunities.id))
      .leftJoin(financeDocumentHandoffs, eq(projectInvoices.opportunity_id, financeDocumentHandoffs.opportunity_id))
      .orderBy(desc(projectInvoices.created_at)),
    db.select({
      id: opportunities.id,
      opty_no: opportunities.opty_no,
      client_name: opportunities.client_name,
      position_name: opportunities.position_name,
      sales_pic_name: opportunities.sales_pic_name,
      service_type_code: opportunities.service_type_code,
      price_amount: opportunities.price_amount,
      start_date: opportunities.start_date,
      end_date: opportunities.end_date,
    }).from(opportunities),
  ]);

  // Billing schedule per opportunity -- dipakai supaya "Services Month" di form
  // Tambah Invoice tinggal pilih dari jadwal yang udah di-generate di A.Contract,
  // bukan diketik manual lagi.
  const billingMonthRows = await db
    .select({ opportunity_id: projectContracts.opportunity_id, month: projectMonthlyBillings.month })
    .from(projectMonthlyBillings)
    .innerJoin(projectContracts, eq(projectMonthlyBillings.contract_id, projectContracts.id));
  const billingMonthsByOpportunity: Record<string, string[]> = {};
  billingMonthRows.forEach((r) => {
    if (!r.opportunity_id) return;
    (billingMonthsByOpportunity[r.opportunity_id] ??= []).push(r.month);
  });
  Object.values(billingMonthsByOpportunity).forEach((months) => months.sort());

  // Urutan list berdasarkan End Date kontrak (project_contracts), bukan created_at --
  // supaya invoice yang project-nya paling dekat berakhir kelihatan duluan.
  // Ambil terpisah (bukan JOIN langsung ke query utama) supaya nggak fan-out
  // baris invoice kalau 1 opportunity kebetulan punya lebih dari 1 kontrak.
  const contractRows = await db.select({ opportunity_id: projectContracts.opportunity_id, end_date: projectContracts.end_date }).from(projectContracts);
  const contractEndDateByOpportunity = new Map<string, string | null>();
  for (const c of contractRows) {
    const existing = contractEndDateByOpportunity.get(c.opportunity_id);
    if (!existing || (c.end_date && c.end_date > existing)) contractEndDateByOpportunity.set(c.opportunity_id, c.end_date);
  }
  const sortedData = [...data].sort((a, b) => {
    const aEnd = a.opportunity_id ? contractEndDateByOpportunity.get(a.opportunity_id) ?? null : null;
    const bEnd = b.opportunity_id ? contractEndDateByOpportunity.get(b.opportunity_id) ?? null : null;
    if (!aEnd && !bEnd) return 0;
    if (!aEnd) return 1;
    if (!bEnd) return -1;
    return bEnd.localeCompare(aEnd);
  });

  const bastByRow = await getAttachmentsWithUrlsForMany(INVOICE_BAST_DOC_SOURCE, sortedData.map((d) => d.id));
  const dataWithAttachments = sortedData.map((d) => ({ ...d, bastAttachments: bastByRow[d.id] }));

  function rp(n: number): string {
    return `Rp ${n.toLocaleString("id-ID")}`;
  }
  const nominalOf = (rows: typeof data) => rows.reduce((sum, d) => sum + (d.price_per_month ?? 0), 0);

  const submittedRows = data.filter((d) => d.status_code === "submitted");
  const overdueRows = data.filter((d) => d.status_code === "overdue");
  const plannedRows = data.filter((d) => d.status_code === "planned");
  const otherRows = data.filter((d) => !["submitted", "overdue", "planned"].includes(d.status_code ?? ""));

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Receipt}
        color="bg-purple-500"
        eyebrow="PMO"
        title="TM Invoice"
        subtitle={t("pageSubtitle")}
      >
        <Link
          href="/pmo/invoices/sheet-sync"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Google Sheet Sync
        </Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard label="Total Invoice" value={data.length} sublabel={rp(nominalOf(data))} color="navy" />
          <StatCard label="Submitted" value={submittedRows.length} sublabel={rp(nominalOf(submittedRows))} color="green" />
          <StatCard label="Overdue · Submission" value={overdueRows.length} sublabel={rp(nominalOf(overdueRows))} color="red" />
          <StatCard label="Invoice Plan" value={plannedRows.length} sublabel={rp(nominalOf(plannedRows))} color="amber" />
          <StatCard label={t("otherLabel")} value={otherRows.length} sublabel={rp(nominalOf(otherRows))} color="purple" />
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <AddRecordModal buttonLabel="Siapkan dari Billing Schedule" title="Siapkan TM Invoice" action={syncBillingScheduleToInvoices}>
            <p className="sm:col-span-3 text-sm text-slate-600">Buat invoice Planned untuk jadwal yang belum memiliki invoice. Jadwal ganda pada PQ dan bulan yang sama dilewati; periksa A.Contract terlebih dahulu. Data invoice yang sudah ada tidak diubah. Hasil pembuatan tercatat di Activity Log.</p>
          </AddRecordModal>
          <AddRecordModal buttonLabel={t("addInvoice")} title={t("addInvoice")} action={createProjectInvoice}>
            <OpportunityPicker opportunities={opportunityOptions} withInvoiceFields billingMonthsByOpportunity={billingMonthsByOpportunity} />

            <Field label="Invoice Plan Date" name="invoice_plan_date" type="date" />
            <Field label={t("colGroup")} name="group_name" hint="Kosongkan buat otomatis pakai nama client" />
            <SelectField label="Status" name="status_code" options={STATUS_OPTIONS} />

            <SelectField label="Issue" name="issue_code" options={INVOICE_ISSUES} />
            <Field label="Submit BAST Date" name="submit_bast_date" type="date" />
            <div />

            <div className="sm:col-span-3">
              <MultiFileUpload name="bast_attachments" label={t("allBastDocsLabel")} />
            </div>

            <div className="sm:col-span-3">
              <Field label="Notes" name="notes" textarea />
            </div>
          </AddRecordModal>
        </div>

        <ExpandableSection title={t("invoiceListTitle", { count: data.length })}>
          <InvoicesTable data={dataWithAttachments} />
        </ExpandableSection>
      </main>
    </div>
  );
}
