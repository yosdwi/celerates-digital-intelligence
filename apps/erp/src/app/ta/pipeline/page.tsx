import { db } from "@/db";
import { applications, requisitions, candidates } from "@/db/schema";
import { getPicNames } from "@/lib/reference-data";
import { desc, eq } from "drizzle-orm";
import { createApplication } from "./actions";
import { PipelineAddFields } from "./pipeline-add-fields";
import { ExpandableSection } from "@/components/expandable-section";
import { ApplicationsTable } from "./applications-table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { getAttachmentsWithUrlsForMany } from "@/lib/attachments";
import { APPLICATION_CV_CELERATES_SOURCE } from "./constants";
import { CANDIDATE_CV_ASLI_SOURCE } from "../candidates/constants";
import { Workflow } from "lucide-react";
import { Field, SelectField } from "@/components/form-fields";
import { getTranslations } from "next-intl/server";

export default async function PipelinePage() {
  const t = await getTranslations("ta.pipeline.page");
  const [rows, requisitionOptions, candidateOptions, picNames] = await Promise.all([
    db
      .select({
        id: applications.id,
        application_date: applications.application_date,
        level_code: applications.level_code,
        ta_pic_name: applications.ta_pic_name,
        cv_celerates_url: applications.cv_celerates_url,
        candidate_source_code: applications.candidate_source_code,
        notes: applications.notes,
        price_amount: applications.price_amount,
        hiring_status_code: applications.hiring_status_code,
        client_name: requisitions.client_name,
        position_name: requisitions.position_name,
        service_type_code: requisitions.service_type_code,
        candidate_no: candidates.candidate_no,
        candidate_name: candidates.candidate_name,
        wa_number: candidates.wa_number,
        email: candidates.email,
        current_salary_amount: candidates.current_salary_amount,
        expected_salary_amount: candidates.expected_salary_amount,
        requisition_id: applications.requisition_id,
        candidate_id: applications.candidate_id,
        client_submission_status_code: applications.client_submission_status_code,
        client_submission_updated_at: applications.client_submission_updated_at,
        client_submission_updated_by_name: applications.client_submission_updated_by_name,
        client_submission_note: applications.client_submission_note,
      })
      .from(applications)
      .leftJoin(requisitions, eq(applications.requisition_id, requisitions.id))
      .leftJoin(candidates, eq(applications.candidate_id, candidates.id))
      // created_at sebagai tiebreaker -- tanpa ini, urutan antar baris dengan
      // application_date yang sama bisa berubah sendiri tiap kali salah satu
      // baris di-UPDATE (mis. ganti hiring status), karena Postgres tidak
      // menjamin urutan stabil untuk nilai yang sama tanpa secondary sort key.
      .orderBy(desc(applications.application_date), desc(applications.created_at)),
    db.select({
      id: requisitions.id,
      client_name: requisitions.client_name,
      position_name: requisitions.position_name,
      service_type_code: requisitions.service_type_code,
      level_code: requisitions.level_code,
      price_amount: requisitions.price_amount,
      ta_pic_name: requisitions.ta_pic_name,
    }).from(requisitions).orderBy(desc(requisitions.created_at)),
    db.select({
      id: candidates.id,
      candidate_no: candidates.candidate_no,
      candidate_name: candidates.candidate_name,
      wa_number: candidates.wa_number,
      email: candidates.email,
      current_salary_amount: candidates.current_salary_amount,
      expected_salary_amount: candidates.expected_salary_amount,
      candidate_source_code: candidates.candidate_source_code,
      position_name: candidates.position_name,
      cv_asli_url: candidates.cv_asli_url,
    }).from(candidates),
    getPicNames(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const cvCeleratesByRow = await getAttachmentsWithUrlsForMany(APPLICATION_CV_CELERATES_SOURCE, rows.map((r) => r.id));

  // Link CV Asli harus selalu ikut attachment CANDIDATE_CV_ASLI_SOURCE yang
  // sebenarnya (bukan kolom teks applications.cv_asli_url yang gampang basi),
  // supaya "Link CV" di pipeline selalu nunjuk ke CV terbaru milik candidate.
  const candidateIds = candidateOptions.map((c) => c.id);
  const candidateCvAttachmentsById = await getAttachmentsWithUrlsForMany(CANDIDATE_CV_ASLI_SOURCE, candidateIds);
  const candidateById = new Map(candidateOptions.map((c) => [c.id, c]));
  const candidateCvUrlByCandidateId: Record<string, string | null> = {};
  // Fallback ke candidates.cv_asli_url (link legacy, biasa keisi dari sheet-sync)
  // kalau belum ada attachment CV asli tersimpan -- tanpa ini kandidat yang CV-nya
  // masuk lewat import sheet nggak pernah kelihatan preview-nya di Hiring Pipeline.
  for (const id of candidateIds) {
    candidateCvUrlByCandidateId[id] = candidateCvAttachmentsById[id]?.[0]?.url ?? candidateById.get(id)?.cv_asli_url ?? null;
  }

  const rowsWithAttachments = rows.map((r) => ({
    ...r,
    cvCeleratesAttachments: cvCeleratesByRow[r.id],
    candidateCvUrl: r.candidate_id ? candidateCvUrlByCandidateId[r.candidate_id] ?? null : null,
  }));

  const onboardingCount = rows.filter((r) => r.hiring_status_code === "onboarding").length;
  const rejectedCount = rows.filter((r) => r.hiring_status_code.startsWith("reject_") || r.hiring_status_code.startsWith("failed_")).length;
  const withdrawnCount = rows.filter((r) => r.hiring_status_code.startsWith("withdraw_")).length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Workflow}
        color="bg-orange-500"
        eyebrow="Talent Acquisition"
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("totalInPipeline")} value={rows.length} color="navy" />
          <StatCard label="Onboarding" value={onboardingCount} color="green" />
          <StatCard label={t("rejectedFailed")} value={rejectedCount} color="red" />
          <StatCard label={t("withdrawn")} value={withdrawnCount} color="amber" />
        </div>

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("addButton")} title={t("addModalTitle")} action={createApplication}>
            <Field label="Hiring Pipeline Date" name="application_date" type="date" defaultValue={today} />

            <PipelineAddFields
              requisitions={requisitionOptions}
              candidates={candidateOptions}
              candidateCvUrls={candidateCvUrlByCandidateId}
              picNames={picNames}
              currentPath="/ta/pipeline"
            />

            <div className="sm:col-span-3">
              <MultiFileUpload name="cv_celerates_attachments" label={t("cvCeleratesLabel")} />
            </div>

            <div className="sm:col-span-3">
              <Field label="Details / Remarks" name="notes" textarea />
            </div>
          </AddRecordModal>
        </div>

        <ExpandableSection title={t("listTitle", { count: rows.length })}>
          <ApplicationsTable data={rowsWithAttachments} />
        </ExpandableSection>
      </main>
    </div>
  );
}
