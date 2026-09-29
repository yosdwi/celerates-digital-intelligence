import { db } from "@/db";
import { applications, requisitions, candidates } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { updateApplication, deleteApplicationAttachment } from "../../actions";
import { EditPickers } from "../../edit-fields";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { getAttachmentsWithUrls } from "@/lib/attachments";
import { APPLICATION_CV_CELERATES_SOURCE } from "../../constants";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";

const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;

export default async function EditApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [application] = await db.select().from(applications).where(eq(applications.id, id));
  if (!application) notFound();

  const t = await getTranslations("ta.pipeline.editPage");
  const tc = await getTranslations("common");

  const [requisitionOptions, candidateOptions, cvCeleratesAttachments] = await Promise.all([
    db.select({ id: requisitions.id, client_name: requisitions.client_name, position_name: requisitions.position_name }).from(requisitions).orderBy(desc(requisitions.created_at)),
    db.select({ id: candidates.id, candidate_no: candidates.candidate_no, candidate_name: candidates.candidate_name }).from(candidates),
    getAttachmentsWithUrls(APPLICATION_CV_CELERATES_SOURCE, id),
  ]);

  const updateApplicationWithId = updateApplication.bind(null, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-amber-500" eyebrow="Talent Acquisition" title={t("title")}>
        <Link href="/ta/pipeline" className="text-sm font-medium text-amber-700 hover:underline">&larr; {t("backToList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-4xl mx-auto">
        <form action={updateApplicationWithId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label="Hiring Pipeline Date" name="application_date" type="date" defaultValue={application.application_date} />

          <EditPickers
            candidates={candidateOptions}
            requisitions={requisitionOptions}
            defaultCandidateId={application.candidate_id ?? ""}
            defaultRequisitionId={application.requisition_id ?? ""}
          />

          <SelectField label="Level" name="level_code" defaultValue={application.level_code ?? ""} options={LEVELS} />
          <Field label="TA PIC" name="ta_pic_name" defaultValue={application.ta_pic_name} required />
          <Field label={t("priceRpPerMonth")} name="price_amount" money defaultValue={application.price_amount?.toString() ?? ""} />

          <Field label={t("cvAsliLink")} name="cv_asli_url" defaultValue={application.cv_asli_url ?? ""} />
          <div className="sm:col-span-2" />
          <div className="sm:col-span-3">
            <MultiFileUpload
              name="cv_celerates_attachments"
              label={t("cvCeleratesLabel")}
              existingFiles={cvCeleratesAttachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteApplicationAttachment}
            />
          </div>

          <Field label="Candidate Source" name="candidate_source_code" defaultValue={application.candidate_source_code ?? ""} />

          <div className="sm:col-span-3">
            <Field label="Details / Remarks" name="notes" defaultValue={application.notes ?? ""} textarea />
          </div>

          <div className="sm:col-span-3 flex gap-3 pt-2">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/ta/pipeline" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {tc("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
