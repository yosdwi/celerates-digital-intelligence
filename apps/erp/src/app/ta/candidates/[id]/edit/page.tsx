import { db } from "@/db";
import { candidates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { updateCandidate, deleteCandidateAttachment } from "../../actions";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { getAttachmentsWithUrls } from "@/lib/attachments";
import { CANDIDATE_CV_ASLI_SOURCE } from "../../constants";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";

const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
const OPEN_STATUS = [
  ["open_dedicated", "Open to Work (Dedicated)"], ["already_worked", "Already worked"], ["open_freelance", "Open (Freelance)"],
] as const;

export default async function EditCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("ta.candidates.editPage");
  const tc = await getTranslations("common");
  const { id } = await params;
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
  if (!candidate) notFound();

  const updateCandidateWithId = updateCandidate.bind(null, id);
  const cvAttachments = await getAttachmentsWithUrls(CANDIDATE_CV_ASLI_SOURCE, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-amber-500" eyebrow="Talent Acquisition" title={`Edit Candidate — ${candidate.candidate_no}`}>
        <Link href="/ta/candidates" className="text-sm font-medium text-amber-700 hover:underline">&larr; {t("backToCandidateList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-4xl mx-auto">
        <form action={updateCandidateWithId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label="Candidate Date" name="candidate_date" type="date" defaultValue={candidate.candidate_date} />
          <Field label="Candidate Name" name="candidate_name" defaultValue={candidate.candidate_name} required />
          <Field label="Positions" name="position_name" defaultValue={candidate.position_name ?? ""} />

          <SelectField label="Level" name="level_code" defaultValue={candidate.level_code ?? ""} options={LEVELS} />
          <Field label="WA Number" name="wa_number" defaultValue={candidate.wa_number ?? ""} />
          <Field label="Email" name="email" type="email" defaultValue={candidate.email ?? ""} />

          <Field label="Current Salary" name="current_salary_amount" money defaultValue={candidate.current_salary_amount?.toString() ?? ""} />
          <Field label="Expected Salary" name="expected_salary_amount" money defaultValue={candidate.expected_salary_amount?.toString() ?? ""} />
          <Field label="TA PIC" name="ta_pic_name" defaultValue={candidate.ta_pic_name} required />

          <Field label={t("cvOriginalLinkLegacyLabel")} name="cv_asli_url" defaultValue={candidate.cv_asli_url ?? ""} />
          <div className="sm:col-span-2" />
          <div className="sm:col-span-3">
            <MultiFileUpload
              name="cv_attachments"
              label={t("cvOriginalFieldLabel")}
              existingFiles={cvAttachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteCandidateAttachment}
            />
          </div>

          <Field label="Candidate Source" name="candidate_source_code" defaultValue={candidate.candidate_source_code ?? ""} />
          <SelectField label="Candidate Open Status" name="candidate_open_status_code" defaultValue={candidate.candidate_open_status_code ?? ""} options={OPEN_STATUS} />

          <div className="sm:col-span-3">
            <Field label="Summary CV" name="cv_summary" defaultValue={candidate.cv_summary ?? ""} textarea />
          </div>

          <div className="sm:col-span-3">
            <Field label="Details / Remarks" name="notes" defaultValue={candidate.notes ?? ""} textarea />
          </div>

          <div className="sm:col-span-3 flex gap-3 pt-2">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/ta/candidates" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {tc("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
