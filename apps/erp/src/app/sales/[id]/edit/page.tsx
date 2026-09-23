import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { opportunities, clients as clientsTable, leads, projectDocuments } from "@/db/schema";
import { getPicNames } from "@/lib/reference-data";
import { eq, isNotNull, getTableColumns } from "drizzle-orm";
import { notFound } from "next/navigation";
import { updateOpportunity, deleteOpportunityAttachment } from "../../actions";
import { OPPORTUNITY_PO_DOC_SOURCE } from "../../constants";
import { PQ_DOCUMENT_SOURCE } from "../../pq-constants";
import Link from "next/link";
import { PicSelect } from "@/components/pic-select";
import { GeneratePqButton } from "../../generate-pq-button";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { getAttachmentsWithUrls } from "@/lib/attachments";
import { Field, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";

const SERVICE_TYPES = [
  ["outsourcing", "Outsourcing"], ["headhunting", "Headhunting"], ["outplacement", "Outplacement"],
  ["managed_service", "Managed Service"], ["project_based", "Project Based"], ["rpo", "RPO"],
  ["training", "Training"], ["license", "License"], ["hardware", "Hardware"],
] as const;
const BUSINESS_UNITS = [["tm", "TM"], ["cs", "CS"], ["solution", "SOLUTION"], ["other", "Other"]] as const;
const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
const PRIORITIES = [["p0", "P0"], ["p1", "P1"], ["p2", "P2"], ["p3", "P3"]] as const;
const CLIENT_TYPES = [["existing", "Existing"], ["new", "New"]] as const;
const BANT_SCORES = [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]] as const;
const PRICE_PERIODS = [
  ["monthly", "Per Bulan"], ["project", "Per Project"], ["yearly", "Per Tahun"], ["daily", "Per Hari"],
] as const;

const LEAD_SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn", ads: "Ads", referral: "Referral", existing: "Existing", website: "Website",
};

// Sama seperti SALES_TYPES di src/components/opportunity-picker.tsx & PMO
// (src/app/pmo/contracts/[id]/edit/edit-contract-form.tsx) -- field ini nulis
// ke project_documents yang sama, jadi daftarnya harus identik.
const SALES_TYPES = [
  ["farming", "Farming"], ["new_closing", "New Closing"], ["overtime", "Overtime"],
  ["business_trip", "Business Trip"], ["other", "Other"], ["medical", "Medical"],
] as const;

// Sama seperti STATUS_OPTIONS di src/app/pmo/page.tsx -- field ini nulis ke
// tabel project_documents yang sama dengan Document Tracker PMO, jadi harus
// pakai daftar status yang identik.
const DOC_STATUS_OPTIONS = [
  ["done_softcopy", "Done Softcopy"], ["done_hardcopy", "Done Hardcopy"], ["on_progress", "On Progress"],
  ["need_fu_hardcopy", "Need FU Hardcopy"], ["need_fu_softcopy", "Need FU Softcopy"], ["none", "None"],
] as const;

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("sales.pqTracker");
  const { id } = await params;
  const [opty] = await db
    .select({ ...getTableColumns(opportunities), lead_source_code: leads.lead_source_code })
    .from(opportunities)
    .leftJoin(leads, eq(opportunities.lead_id, leads.id))
    .where(eq(opportunities.id, id));
  if (!opty) notFound();
  const leadSourceLabel = opty.lead_source_code ? LEAD_SOURCE_LABELS[opty.lead_source_code] ?? opty.lead_source_code : "-";

  const [picNames, positionRows, clientOptions, allPqs, attachments, pqAttachments, [projectDoc]] = await Promise.all([
    getPicNames(),
    db.select({ position_name: opportunities.position_name }).from(opportunities).where(isNotNull(opportunities.position_name)),
    db.select({ name: clientsTable.name, code: clientsTable.code }).from(clientsTable),
    db.select({ pq_no: opportunities.pq_no }).from(opportunities),
    getAttachmentsWithUrls(OPPORTUNITY_PO_DOC_SOURCE, id),
    getAttachmentsWithUrls(PQ_DOCUMENT_SOURCE, id),
    db.select().from(projectDocuments).where(eq(projectDocuments.opportunity_id, id)).limit(1),
  ]);
  const positionSuggestions = Array.from(new Set(positionRows.map((r) => r.position_name).filter((p): p is string => !!p?.trim()))).sort();
  const suggestedSeq = allPqs.filter((o) => o.pq_no).length + 1;

  const updateOpportunityWithId = updateOpportunity.bind(null, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-blue-500" eyebrow="Sales" title={t("editTitle", { optyNo: opty.opty_no })}>
        <Link href="/sales" className="text-sm font-medium text-blue-700 hover:underline">&larr; {t("backToList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-4xl mx-auto">
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 mb-4 text-xs text-slate-700">
          <span className="text-slate-500">{t("leadSourceLabel")}:</span> {leadSourceLabel}
        </div>

        <form action={updateOpportunityWithId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label={t("fields.clientName")} name="client_name" defaultValue={opty.client_name} required />
          <SelectField label="Client Type" name="client_type_code" defaultValue={opty.client_type_code ?? ""} options={CLIENT_TYPES} />
          <Field label={t("fields.projectName")} name="project_name" defaultValue={opty.project_name} required />

          <Field label="Positions" name="position_name" defaultValue={opty.position_name ?? ""} suggestions={positionSuggestions} />
          <SelectField label="Service Type" name="service_type_code" defaultValue={opty.service_type_code} options={SERVICE_TYPES} required />
          <SelectField label="Business Unit" name="business_unit_code" defaultValue={opty.business_unit_code ?? ""} options={BUSINESS_UNITS} />

          <SelectField label="Level" name="level_code" defaultValue={opty.level_code ?? ""} options={LEVELS} />
          <Field label="Headcount" name="headcount_target" type="number" defaultValue={opty.headcount_target?.toString() ?? ""} />
          <Field label="Estimasi Durasi (bulan)" name="estimated_duration_months" type="number" defaultValue={opty.estimated_duration_months?.toString() ?? ""} />
          <SelectField label="Priority" name="priority_code" defaultValue={opty.priority_code ?? ""} options={PRIORITIES} />

          <SelectField label="BANT Score" name="bant_score" defaultValue={opty.bant_score?.toString() ?? ""} options={BANT_SCORES} />
          <Field label={t("fields.price")} name="price_amount" money defaultValue={opty.price_amount?.toString() ?? ""} />
          <SelectField label={t("fields.pricePeriod")} name="price_period_code" defaultValue={opty.price_period_code ?? "monthly"} options={PRICE_PERIODS} />
          <PicSelect name="sales_pic_name" label="Sales PIC" defaultValue={opty.sales_pic_name} options={picNames} required currentPath={`/sales/${id}/edit`} />

          <div>
            <Field label="PQ Number" name="pq_no" defaultValue={opty.pq_no ?? ""} />
            <GeneratePqButton suggestedSeq={suggestedSeq} clients={clientOptions} />
          </div>
          <Field label="Opty Request Date" name="opty_request_date" type="date" defaultValue={opty.opty_request_date ?? ""} />
          <Field label="Approval Date" name="approval_date" type="date" defaultValue={opty.approval_date ?? ""} />
          <Field label={t("fields.legacyPoDocLink")} name="po_doc_url" defaultValue={opty.po_doc_url ?? ""} />

          <Field label="Start Date" name="start_date" type="date" defaultValue={opty.start_date ?? ""} hint="Otomatis dipakai buat Document Tracker & Contract Tracker di PMO" />
          <Field label="End Date" name="end_date" type="date" defaultValue={opty.end_date ?? ""} hint="Otomatis dipakai buat Document Tracker & Contract Tracker di PMO" />
          <div />

          <div className="sm:col-span-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Dokumen Legal Project</p>
              <p className="text-xs text-slate-400 mb-3">Sync dua arah dengan Document Tracker PMO -- No &amp; Status yang diisi/diubah di sini otomatis muncul di sana, dan sebaliknya.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-4">
                <div className="sm:col-span-3">
                  <Field label="Project Details" name="project_details" defaultValue={projectDoc?.project_details ?? ""} textarea />
                </div>
                <SelectField label="Sales Type" name="sales_type_code" defaultValue={projectDoc?.sales_type_code ?? ""} options={SALES_TYPES} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Field label="No PKS" name="pks_no" defaultValue={projectDoc?.pks_no ?? ""} />
                <SelectField label="Status PKS" name="pks_status_code" defaultValue={projectDoc?.pks_status_code ?? ""} options={DOC_STATUS_OPTIONS} />
                <Field label="No PO" name="po_no" defaultValue={projectDoc?.po_no ?? ""} />
                <SelectField label="Status PO" name="po_status_code" defaultValue={projectDoc?.po_status_code ?? ""} options={DOC_STATUS_OPTIONS} />
                <Field label="No CR" name="cr_no" defaultValue={projectDoc?.cr_no ?? ""} />
                <SelectField label="Status CR" name="cr_status_code" defaultValue={projectDoc?.cr_status_code ?? ""} options={DOC_STATUS_OPTIONS} />
                <Field label="No Dokumen Lain" name="other_doc_no" defaultValue={projectDoc?.other_doc_no ?? ""} />
                <SelectField label="Status Dokumen Lain" name="other_doc_status_code" defaultValue={projectDoc?.other_doc_status_code ?? ""} options={DOC_STATUS_OPTIONS} />
              </div>
              <p className="text-xs text-slate-400 mt-3">Upload file/link dokumennya tetap lewat Document Tracker PMO.</p>
            </div>
          </div>

          <div className="sm:col-span-3">
            <MultiFileUpload
              name="attachments"
              label={t("fields.poDoc")}
              existingFiles={attachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOpportunityAttachment}
            />
          </div>

          <div className="sm:col-span-3">
            <MultiFileUpload
              name="pq_attachments"
              label={t("fields.pqDoc")}
              existingFiles={pqAttachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteOpportunityAttachment}
            />
          </div>

          <div className="sm:col-span-3">
            <Field label={t("fields.notes")} name="notes" defaultValue={opty.notes ?? ""} textarea />
          </div>

          <div className="sm:col-span-3 flex gap-3 pt-2">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/sales" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
