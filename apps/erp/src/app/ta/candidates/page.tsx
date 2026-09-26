import { db } from "@/db";
import { candidates } from "@/db/schema";
import { getPicNames } from "@/lib/reference-data";
import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { createCandidate } from "./actions";
import Link from "next/link";
import { SmartFileLink } from "./smart-file-link";
import { ExpandableSection } from "@/components/expandable-section";
import { PicSelect } from "@/components/pic-select";
import { DeleteCandidateButton } from "./delete-candidate-button";
import { TableControls } from "@/components/table-controls";
import { CandidatesTable } from "./candidates-table";
import { UserSquare2, RefreshCw } from "lucide-react";
import { AddRecordModal } from "@/components/add-record-modal";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { getAttachmentsWithUrlsForMany } from "@/lib/attachments";
import { CANDIDATE_CV_ASLI_SOURCE } from "./constants";
import { Field, SelectField } from "@/components/form-fields";

const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
const SOURCES = [
  ["hijack_linkedin", "Hijack LinkedIn"], ["linkedin_job_portal", "LinkedIn Job Portal"],
  ["glints", "Glints"], ["google_form_celerates", "Google Form Celerates"], ["referral", "Referral"],
  ["marketing_ads", "Marketing Ads"], ["hiring_partner", "Hiring Partner"],
  ["linkedin_recruiter_post", "LinkedIn Recruiter Post"], ["celerates_connect_wa", "Celerates Connect (WA Community)"],
  ["linkedin_celerates_page", "LinkedIn Celerates Page"], ["database", "Database"], ["kalibrr", "Kalibrr"],
] as const;
const OPEN_STATUS = [
  ["open_dedicated", "Open to Work (Dedicated)"], ["already_worked", "Already worked"], ["open_freelance", "Open (Freelance)"],
] as const;

export default async function CandidatesPage() {
  const t = await getTranslations("ta.candidates.page");
  const [data, picNames] = await Promise.all([
    db.select().from(candidates).orderBy(desc(candidates.created_at)),
    getPicNames(),
  ]);

  const cvByRow = await getAttachmentsWithUrlsForMany(CANDIDATE_CV_ASLI_SOURCE, data.map((c) => c.id));
  const dataWithAttachments = data.map((c) => ({ ...c, cvAttachments: cvByRow[c.id] }));

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={UserSquare2}
        color="bg-orange-500"
        eyebrow="Talent Acquisition"
        title="Candidate"
        subtitle={t("subtitle")}
      >
        <Link
          href="/ta/candidates/sheet-sync"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Google Sheet Sync
        </Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Candidate" value={data.length} color="navy" />
          <StatCard label="Open to Work" value={data.filter((d) => d.candidate_open_status_code === "open_dedicated").length} color="green" />
          <StatCard label="Already Worked" value={data.filter((d) => d.candidate_open_status_code === "already_worked").length} color="blue" />
          <StatCard label="Freelance" value={data.filter((d) => d.candidate_open_status_code === "open_freelance").length} color="orange" />
        </div>

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("addCandidateButton")} title={t("addCandidateButton")} action={createCandidate}>
            <Field label="Candidate Date" name="candidate_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            <Field label="Candidate Name" name="candidate_name" required />
            <Field label="Positions" name="position_name" />
            <SelectField label="Level" name="level_code" options={LEVELS} />

            <Field label="WA Number" name="wa_number" />
            <Field label="Email" name="email" type="email" />
            <Field label="Current Salary" name="current_salary_amount" money />

            <Field label="Expected Salary" name="expected_salary_amount" money />
            <PicSelect name="ta_pic_name" label="TA PIC" options={picNames} required currentPath="/ta/candidates" />
            <SelectField label="Candidate Source" name="candidate_source_code" options={SOURCES} />
            <SelectField label="Candidate Open Status" name="candidate_open_status_code" options={OPEN_STATUS} />
            <div />

            <div className="sm:col-span-3">
              <MultiFileUpload name="cv_attachments" label={t("cvOriginalFieldLabel")} />
            </div>

            <div className="sm:col-span-3">
              <Field label="Summary CV" name="cv_summary" textarea />
            </div>

            <div className="sm:col-span-3">
              <Field label="Details / Remarks" name="notes" textarea />
            </div>
          </AddRecordModal>
        </div>

        <ExpandableSection title={t("listTitle", { count: data.length })}>
          <CandidatesTable data={dataWithAttachments} />
        </ExpandableSection>
      </main>
    </div>
  );
}
