import { db } from "@/db";
import { projectDocuments, opportunities } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { createProjectDocument, syncDocumentTrackerFromContracts } from "./actions";
import { PROJECT_DOC_SOURCES } from "./constants";
import { getAttachmentsWithUrlsForMany } from "@/lib/attachments";
import { OpportunityPicker } from "@/components/opportunity-picker";
import { DocumentsTable } from "./documents-table";
import { ExpandableSection } from "@/components/expandable-section";
import { MultiFileUpload } from "@/components/multi-file-upload";
import Link from "next/link";
import { RefreshCw, FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field, SelectField } from "@/components/form-fields";


const STATUS_OPTIONS = [
  ["done_softcopy", "Done Softcopy"], ["done_hardcopy", "Done Hardcopy"], ["on_progress", "On Progress"],
  ["need_fu_hardcopy", "Need FU Hardcopy"], ["need_fu_softcopy", "Need FU Softcopy"], ["none", "None"],
] as const;
export default async function PMOPage() {
  const t = await getTranslations("pmo");
  await syncDocumentTrackerFromContracts();
  const [data, opportunityOptions] = await Promise.all([
    db
      .select({
        id: projectDocuments.id,
        opty_no: opportunities.opty_no,
        client_name: opportunities.client_name,
        position_name: opportunities.position_name,
        sales_pic_name: opportunities.sales_pic_name,
        project_details: projectDocuments.project_details,
        pq_price: projectDocuments.pq_price,
        pq_total: projectDocuments.pq_total,
        pks_no: projectDocuments.pks_no,
        pks_url: projectDocuments.pks_url,
        pks_status_code: projectDocuments.pks_status_code,
        po_no: projectDocuments.po_no,
        po_url: projectDocuments.po_url,
        po_status_code: projectDocuments.po_status_code,
        po_start_date: projectDocuments.po_start_date,
        po_end_date: projectDocuments.po_end_date,
        cr_no: projectDocuments.cr_no,
        cr_url: projectDocuments.cr_url,
        cr_status_code: projectDocuments.cr_status_code,
        other_doc_no: projectDocuments.other_doc_no,
        other_doc_url: projectDocuments.other_doc_url,
        other_doc_status_code: projectDocuments.other_doc_status_code,
        created_at: projectDocuments.created_at,
      })
      .from(projectDocuments)
      .leftJoin(opportunities, eq(projectDocuments.opportunity_id, opportunities.id))
      .orderBy(desc(projectDocuments.created_at)),
    db.select({
      id: opportunities.id,
      opty_no: opportunities.opty_no,
      client_name: opportunities.client_name,
      position_name: opportunities.position_name,
      sales_pic_name: opportunities.sales_pic_name,
      service_type_code: opportunities.service_type_code,
      client_type_code: opportunities.client_type_code,
      price_amount: opportunities.price_amount,
      start_date: opportunities.start_date,
      end_date: opportunities.end_date,
    }).from(opportunities),
  ]);

  const ids = data.map((d) => d.id);
  const [pksByRow, poByRow, crByRow, otherByRow] = await Promise.all([
    getAttachmentsWithUrlsForMany(PROJECT_DOC_SOURCES.pks, ids),
    getAttachmentsWithUrlsForMany(PROJECT_DOC_SOURCES.po, ids),
    getAttachmentsWithUrlsForMany(PROJECT_DOC_SOURCES.cr, ids),
    getAttachmentsWithUrlsForMany(PROJECT_DOC_SOURCES.other, ids),
  ]);
  const dataWithAttachments = data.map((d) => ({
    ...d,
    pksAttachments: pksByRow[d.id],
    poAttachments: poByRow[d.id],
    crAttachments: crByRow[d.id],
    otherAttachments: otherByRow[d.id],
  }));

  const doneCount = data.filter((d) => d.pks_status_code === "done_softcopy" || d.pks_status_code === "done_hardcopy").length;
  const onProgressCount = data.filter((d) => d.pks_status_code === "on_progress" || d.po_status_code === "on_progress").length;
  const needFuCount = data.filter((d) =>
    [d.pks_status_code, d.po_status_code, d.cr_status_code, d.other_doc_status_code].some((s) => s === "need_fu_hardcopy" || s === "need_fu_softcopy")
  ).length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={FileText}
        color="bg-purple-500"
        eyebrow="PMO"
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      >
        <Link
          href="/pmo/sheet-sync"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("googleSheetSync")}
        </Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("statTotalDocuments")} value={data.length} color="navy" />
          <StatCard label={t("statDone")} value={doneCount} color="green" />
          <StatCard label={t("statOnProgress")} value={onProgressCount} color="blue" />
          <StatCard label={t("statNeedFollowUp")} value={needFuCount} color="amber" />
        </div>

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("addDocumentButton")} title={t("addDocumentButton")} action={createProjectDocument}>
            <OpportunityPicker opportunities={opportunityOptions} withDocumentFields />

            <div className="sm:col-span-3">
              <Field label="Project Details" name="project_details" textarea />
            </div>

            <div className="sm:col-span-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-3">{t("pksSectionTitle")}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label={t("headers.noPks")} name="pks_no" />
                  <SelectField label={t("statusPks")} name="pks_status_code" options={STATUS_OPTIONS} />
                </div>
                <div className="mt-3">
                  <MultiFileUpload name="pks_attachments" label={t("pksAttachmentsLabel")} />
                </div>
              </div>
            </div>

            <div className="sm:col-span-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-3">{t("poSectionTitle")}</p>
                <p className="text-xs text-slate-400 -mt-2 mb-3">{t("poDateHint")}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label={t("headers.noPo")} name="po_no" />
                  <SelectField label={t("statusPo")} name="po_status_code" options={STATUS_OPTIONS} />
                </div>
                <div className="mt-3">
                  <MultiFileUpload name="po_attachments" label={t("poAttachmentsLabel")} />
                </div>
              </div>
            </div>

            <div className="sm:col-span-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-3">{t("crSectionTitle")}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label={t("headers.noCr")} name="cr_no" />
                  <SelectField label={t("headers.statusCr")} name="cr_status_code" options={STATUS_OPTIONS} />
                </div>
                <div className="mt-3">
                  <MultiFileUpload name="cr_attachments" label={t("crAttachmentsLabel")} />
                </div>
              </div>
            </div>

            <div className="sm:col-span-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-3">{t("otherDocSectionTitle")}</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label={t("headers.noOtherDoc")} name="other_doc_no" />
                  <SelectField label={t("headers.statusOtherDoc")} name="other_doc_status_code" options={STATUS_OPTIONS} />
                </div>
                <div className="mt-3">
                  <MultiFileUpload name="other_attachments" label={t("otherDocAttachmentsLabel")} />
                </div>
              </div>
            </div>
          </AddRecordModal>
        </div>

        <ExpandableSection title={t("documentsListTitle", { count: data.length })}>
          <DocumentsTable data={dataWithAttachments} />
        </ExpandableSection>
      </main>
    </div>
  );
}
