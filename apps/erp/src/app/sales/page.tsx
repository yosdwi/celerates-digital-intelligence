import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { opportunities, leads, clients, signatureRequests } from "@/db/schema";
import { getPicNames } from "@/lib/reference-data";
import { desc, getTableColumns, eq, isNotNull } from "drizzle-orm";
import { createOpportunity } from "./actions";
import { OPPORTUNITY_PO_DOC_SOURCE } from "./constants";
import { PQ_DOCUMENT_SOURCE, PQ_SIGNATURE_SOURCE } from "./pq-constants";
import { getAttachmentsWithUrlsForMany, type AttachmentWithUrl } from "@/lib/attachments";
import { getActiveUserOptions } from "@/lib/approval-journey";
import { ExpandableSection } from "@/components/expandable-section";
import { PicSelect } from "@/components/pic-select";
import { MultiFileUpload } from "@/components/multi-file-upload";
import type { PqSignatureInfo } from "./pq-signature-status";
import { OpportunitiesTable } from "./opportunities-table";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TrendingUp } from "lucide-react";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field, SelectField } from "@/components/form-fields";

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
const PIPELINE_STAGES = [["win", "Win"], ["drop", "Drop"], ["hold", "Hold"], ["on_going", "On Going"]] as const;
const OPTY_STATUS = [
  ["on_hold", "Project on Hold"], ["client_not_responding", "Client Not Responding"],
  ["lost_pitching", "Lost on Pitching Period"], ["waiting_feedback", "Waiting for Feedback"],
  ["budget_on_hold", "Client Budget on Hold"], ["won", "Project Won"],
  ["closed_lost", "Closed Lost"], ["on_going_others", "Opty on Going Others"],
] as const;

export default async function SalesPage() {
  const t = await getTranslations("sales.pqTracker");
  const [data, picNames, positionRows, clientOptions, userOptions, allPqSignatures] = await Promise.all([
    db
      .select({
        ...getTableColumns(opportunities),
        lead_source_code: leads.lead_source_code,
      })
      .from(opportunities)
      .leftJoin(leads, eq(opportunities.lead_id, leads.id))
      .orderBy(desc(opportunities.created_at)),
    getPicNames(),
    db.select({ position_name: opportunities.position_name }).from(opportunities).where(isNotNull(opportunities.position_name)),
    db.select({ id: clients.id, name: clients.name, code: clients.code }).from(clients),
    getActiveUserOptions(),
    db.select().from(signatureRequests).where(eq(signatureRequests.source_type, PQ_SIGNATURE_SOURCE)),
  ]);

  const positionSuggestions = Array.from(new Set(positionRows.map((r) => r.position_name).filter((p): p is string => !!p?.trim()))).sort();
  const userMap = new Map(userOptions.map((u) => [u.id, u]));

  const pqSigByOpty = new Map<string, (typeof allPqSignatures)[number]>();
  for (const s of allPqSignatures) {
    if (s.source_id) pqSigByOpty.set(s.source_id, s);
  }

  const optyIds = data.map((d) => d.id);
  const [attachmentsByOptyRaw, pqAttachmentsByOptyRaw] = await Promise.all([
    getAttachmentsWithUrlsForMany(OPPORTUNITY_PO_DOC_SOURCE, optyIds),
    getAttachmentsWithUrlsForMany(PQ_DOCUMENT_SOURCE, optyIds),
  ]);
  const attachmentsByOpty = new Map<string, AttachmentWithUrl[]>(Object.entries(attachmentsByOptyRaw));
  const pqAttachmentsByOpty = new Map<string, AttachmentWithUrl[]>(Object.entries(pqAttachmentsByOptyRaw));
  const dataWithAttachments = data.map((d) => {
    const sig = pqSigByOpty.get(d.id);
    const pqSignature: PqSignatureInfo = {
      status: (sig?.status_code as PqSignatureInfo["status"]) ?? "not_sent",
      signerName: sig ? userMap.get(sig.signer_user_id)?.full_name ?? null : null,
    };
    return {
      ...d,
      poDocAttachments: attachmentsByOpty.get(d.id) ?? [],
      pqDocAttachments: pqAttachmentsByOpty.get(d.id) ?? [],
      pqSignature,
    };
  });

  return (
    <div className="min-h-screen">
      <PageHeader
  icon={TrendingUp}
  color="bg-blue-500"
  eyebrow="Sales"
  title="PQ Tracker"
  subtitle={t("subtitle")}
>
  <Link
    href="/sales/sheet-sync"
    className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
  >
    <RefreshCw className="h-3.5 w-3.5" />
    Google Sheet Sync
  </Link>
</PageHeader>

<main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
    <StatCard label="Total PQ" value={data.length} color="navy" />
    <StatCard label="Win" value={data.filter((d) => d.pipeline_stage_code === "win").length} color="green" />
    <StatCard label="On Going" value={data.filter((d) => d.pipeline_stage_code === "on_going").length} color="blue" />
    <StatCard label={t("statNeedGeneratePq")} value={data.filter((d) => !d.pq_no && d.onboarding_request_id).length} color="amber" />
  </div>

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("addNew")} title={t("addNew")} action={createOpportunity}>
            <Field label={t("fields.clientName")} name="client_name" required />
            <SelectField label="Client Type" name="client_type_code" options={CLIENT_TYPES} />
            <Field label={t("fields.projectName")} name="project_name" required />

            <Field label="Positions" name="position_name" suggestions={positionSuggestions} />
            <SelectField label="Service Type" name="service_type_code" required options={SERVICE_TYPES} />
            <SelectField label="Business Unit" name="business_unit_code" options={BUSINESS_UNITS} />

            <SelectField label="Level" name="level_code" options={LEVELS} />
            <Field label="Headcount" name="headcount_target" type="number" />
            <Field label="Estimasi Durasi (bulan)" name="estimated_duration_months" type="number" />
            <SelectField label="Priority" name="priority_code" options={PRIORITIES} />

            <SelectField label="BANTE Score" name="bant_score" options={BANT_SCORES} />
            <Field label={t("fields.price")} name="price_amount" money />
            <SelectField label={t("fields.pricePeriod")} name="price_period_code" defaultValue="monthly" options={PRICE_PERIODS} />
            <PicSelect name="sales_pic_name" label="Sales PIC" options={picNames} required currentPath="/sales" />

            <SelectField label="Pipeline Stage" name="pipeline_stage_code" options={PIPELINE_STAGES} />
            <SelectField label="Opty Status" name="opty_status_code" options={OPTY_STATUS} />
            <Field label="Opty Request Date" name="opty_request_date" type="date" />

            <Field label="Approval Date" name="approval_date" type="date" />
            <Field label="Start Date" name="start_date" type="date" hint="Otomatis dipakai buat Document Tracker & Contract Tracker di PMO" />
            <Field label="End Date" name="end_date" type="date" hint="Otomatis dipakai buat Document Tracker & Contract Tracker di PMO" />

            <div className="sm:col-span-3">
              <MultiFileUpload name="attachments" label={t("fields.poDoc")} />
            </div>

            <div className="sm:col-span-3">
              <MultiFileUpload name="pq_attachments" label={t("fields.pqDoc")} />
            </div>

            <div className="sm:col-span-3">
              <Field label={t("fields.notes")} name="notes" textarea />
            </div>
          </AddRecordModal>
        </div>

        <ExpandableSection title={t("listTitle", { count: data.length })}>
          <OpportunitiesTable data={dataWithAttachments} clients={clientOptions} userOptions={userOptions} />
        </ExpandableSection>
      </main>
    </div>
  );
}

