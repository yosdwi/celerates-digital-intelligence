import { db } from "@/db";
import { projectInvoices, opportunities, projectContracts, projectMonthlyBillings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { updateProjectInvoice, deleteInvoiceAttachment } from "../../../actions";
import { INVOICE_BAST_DOC_SOURCE, INVOICE_ISSUES } from "../../../constants";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { getAttachmentsWithUrls } from "@/lib/attachments";
import { formatMonthNameYear } from "@/lib/month-format";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";

const STATUS_OPTIONS = [["overdue", "Overdue"], ["submitted", "Submitted"], ["planned", "Invoice Plan"], ["canceled", "Canceled"]] as const;

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("pmo.invoices");
  const tc = await getTranslations("common");
  const { id } = await params;
  const [invoice] = await db.select().from(projectInvoices).where(eq(projectInvoices.id, id));
  if (!invoice) notFound();

  const [[opty], contractRows, bastAttachments] = await Promise.all([
    db.select().from(opportunities).where(eq(opportunities.id, invoice.opportunity_id)),
    db.select({ id: projectContracts.id }).from(projectContracts).where(eq(projectContracts.opportunity_id, invoice.opportunity_id)),
    getAttachmentsWithUrls(INVOICE_BAST_DOC_SOURCE, id),
  ]);
  const contractIds = contractRows.map((c) => c.id);
  const billingMonths = contractIds.length > 0
    ? await db.select({ month: projectMonthlyBillings.month }).from(projectMonthlyBillings)
        .where(eq(projectMonthlyBillings.contract_id, contractIds[0]))
    : [];
  const months = billingMonths.map((b) => b.month).sort();
  // Kalau invoice ini punya services_month_start lama yang bukan bagian dari
  // billing schedule (mis. data legacy), tetap tampilkan di opsi supaya nggak hilang.
  if (invoice.services_month_start && !months.includes(invoice.services_month_start)) {
    months.push(invoice.services_month_start);
    months.sort();
  }

  const updateWithId = updateProjectInvoice.bind(null, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-violet-500" eyebrow="PMO" title={`Edit Invoice — ${opty?.client_name ?? "-"}`}>
        <Link href="/pmo/invoices" className="text-sm font-medium text-violet-700 hover:underline">&larr; {t("backToInvoiceList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-3xl mx-auto">
        <form action={updateWithId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label="Invoice Plan Date" name="invoice_plan_date" type="date" defaultValue={invoice.invoice_plan_date ?? ""} />
          <Field label={t("colGroup")} name="group_name" defaultValue={invoice.group_name ?? ""} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Services Month</span>
            <select
              name="services_month_start"
              defaultValue={invoice.services_month_start ?? ""}
              disabled={months.length === 0}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">-</option>
              {months.map((m) => <option key={m} value={m}>{formatMonthNameYear(m)}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-400">
              {months.length === 0 ? t("createBillingScheduleFirst") : t("autoFromBillingSchedule")}
            </span>
          </label>

          <Field label="Price / Month" name="price_per_month" money defaultValue={invoice.price_per_month?.toString() ?? ""} />
          <SelectField label="Status" name="status_code" defaultValue={invoice.status_code ?? ""} options={STATUS_OPTIONS} />
          <SelectField label="Issue" name="issue_code" defaultValue={invoice.issue_code ?? ""} options={INVOICE_ISSUES} />

          <Field label="Submit BAST Date" name="submit_bast_date" type="date" defaultValue={invoice.submit_bast_date ?? ""} />
          <div />
          <div />

          <Field label={t("bastLinkLegacyLabel")} name="bast_support_doc_url" defaultValue={invoice.bast_support_doc_url ?? ""} />
          <div className="sm:col-span-3">
            <MultiFileUpload
              name="bast_attachments"
              label={t("allBastDocsLabel")}
              existingFiles={bastAttachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={(attachmentId) => deleteInvoiceAttachment(attachmentId, id)}
            />
          </div>

          <div className="sm:col-span-3">
            <Field label="Notes" name="notes" defaultValue={invoice.notes ?? ""} textarea />
          </div>

          <div className="sm:col-span-3 flex gap-3 pt-2">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/pmo/invoices" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {tc("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
