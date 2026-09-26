import { db } from "@/db";
import { talentAssignments, requisitions, employmentContracts, employees, candidates, onboardingRequests, opportunities } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { updateTalentAssignment } from "../../actions";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";
import { LinkOrFileField } from "@/components/link-or-file-field";
import { PageHeader } from "@/components/page-header";
import { Pencil, Calculator } from "lucide-react";
import { addOneYear } from "@/lib/date-utils";
import { getTranslations } from "next-intl/server";

const STATUS_OPTIONS = [
  ["on_project", "On Project"], ["idle", "Idle"], ["out", "Out"], ["internal_project", "Internal Project"],
  ["resignation_on_progress", "Resignation on Progress"], ["waiting_for_project_onboard", "Waiting for Project Onboard"],
  ["not_in_assignment", "Not in Assignment"], ["promote", "Promote"],
] as const;
const TALENT_TRACKS = [["pm", "PM"], ["sad", "SAD"], ["bdcs", "BDCS"], ["das", "DAS"]] as const;
const GRADING_OPTIONS = [["g1","G1"],["g2","G2"],["g3","G3"],["g4","G4"],["g5","G5"],["g6","G6"],["g7","G7"]] as const;
const STATUS_ALL_DATA_OPTIONS = [["updated","Updated"],["will_be_update","Will be Update"],["obsolete","Obsolete"]] as const;

export default async function EditTalentAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("tm.editAssignment");
  const tc = await getTranslations("common");
  const { id } = await params;
  const [[assignment], requisitionOptions, pqOptions] = await Promise.all([
    db.select().from(talentAssignments).where(eq(talentAssignments.id, id)),
    db.select({ id: requisitions.id, client_name: requisitions.client_name, position_name: requisitions.position_name }).from(requisitions),
    db.select({ id: opportunities.id, pq_no: opportunities.pq_no, client_name: opportunities.client_name, opty_no: opportunities.opty_no }).from(opportunities),
  ]);
  if (!assignment) notFound();

  // Info project (Employee No/Nama/ID Opty/PQ No/Client/Position) ditarik
  // LANGSUNG dari data Sales/TA/HR lewat requisition_id & pq_tracker_id yang
  // sudah tersimpan di assignment ini -- read-only, selalu sinkron ke sumber
  // aslinya, bukan salinan yang bisa basi.
  const [projectInfo] = await db
    .select({
      employee_no: employees.employee_no,
      candidate_name: candidates.candidate_name,
      req_client_name: requisitions.client_name,
      req_position_name: requisitions.position_name,
      opty_no: opportunities.opty_no,
      pq_no: opportunities.pq_no,
    })
    .from(talentAssignments)
    .leftJoin(employees, eq(talentAssignments.employee_id, employees.id))
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .leftJoin(requisitions, eq(talentAssignments.requisition_id, requisitions.id))
    .leftJoin(opportunities, eq(talentAssignments.pq_tracker_id, opportunities.id))
    .where(eq(talentAssignments.id, id));

  // Kontrak paling awal (induk) milik employee ini -- dasar hitung default
  // Increment Date (+1 tahun), sama seperti di ADD flow (EmployeePicker).
  const [earliestContract] = await db
    .select({ start_date: employmentContracts.start_date })
    .from(employmentContracts)
    .where(eq(employmentContracts.employee_id, assignment.employee_id))
    .orderBy(asc(employmentContracts.start_date))
    .limit(1);
  const defaultIncrementDate = assignment.increment_date ?? addOneYear(earliestContract?.start_date) ?? "";

  // End Date default dari kontrak HR TERBARU (bukan yang paling awal) --
  // sama seperti pola getPendingContractSetups di src/lib/pq-approval.ts.
  const [latestContract] = await db
    .select({ end_date: employmentContracts.end_date })
    .from(employmentContracts)
    .where(eq(employmentContracts.employee_id, assignment.employee_id))
    .orderBy(desc(employmentContracts.start_date))
    .limit(1);
  const defaultEndDate = assignment.end_date ?? latestContract?.end_date ?? "";

  const updateWithId = updateTalentAssignment.bind(null, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-sky-500" eyebrow="Talent Management" title="Edit Talent Assignment">
        <Link href="/tm" className="text-sm font-medium text-sky-700 hover:underline">&larr; {t("backToList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-5xl mx-auto">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">{t("projectInfoTitle")}</h2>
          <p className="text-xs text-slate-500 mb-4">{t("projectInfoHint")}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryTextField label="Employee No" value={projectInfo?.employee_no} />
            <SummaryTextField label={t("talentName")} value={projectInfo?.candidate_name} />
            <SummaryTextField label="ID Opty" value={projectInfo?.opty_no} />
            <SummaryTextField label="PQ No" value={projectInfo?.pq_no} />
            <SummaryTextField label="Client" value={projectInfo?.req_client_name} />
            <SummaryTextField label="Positions" value={projectInfo?.req_position_name} />
          </div>
        </section>

        <form action={updateWithId} className="space-y-6">
          <FormSection title={t("sectionInfoProject")}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Requisition (Client/Project)</span>
              <select name="requisition_id" defaultValue={assignment.requisition_id ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">{t("selectPlaceholder")}</option>
                {requisitionOptions.map((r) => <option key={r.id} value={r.id}>{r.client_name} - {r.position_name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">PQ Tracker (ID Opty)</span>
              <select name="pq_tracker_id" defaultValue={assignment.pq_tracker_id ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">{t("selectPlaceholder")}</option>
                {pqOptions.map((pq) => <option key={pq.id} value={pq.id}>{pq.opty_no} - {pq.client_name} {pq.pq_no ? `(PQ: ${pq.pq_no})` : ""}</option>)}
              </select>
            </label>
            <Field label="Start Date" name="start_date" type="date" defaultValue={assignment.start_date ?? ""} />
            <Field label="End Date" name="end_date" type="date" defaultValue={defaultEndDate} />
            <SelectField label="Status" name="status_code" defaultValue={assignment.status_code ?? ""} options={STATUS_OPTIONS} />
            <SelectField label="Talent Track" name="talent_track_code" defaultValue={assignment.talent_track_code ?? ""} options={TALENT_TRACKS} />
            <Field label="Increment Date" name="increment_date" type="date" defaultValue={defaultIncrementDate} />
            <SelectField label="Current Grading" name="current_grading" defaultValue={assignment.current_grading ?? ""} options={GRADING_OPTIONS} />
            <SelectField label="Current Salary Grade" name="current_salary_grade_code" defaultValue={assignment.current_salary_grade_code ?? ""} options={GRADING_OPTIONS} />
            <Field label="Current Skill" name="current_skill" defaultValue={assignment.current_skill ?? ""} />
            <Field label="Current Certification" name="current_certification" defaultValue={assignment.current_certification ?? ""} />
            <LinkOrFileField label="Performance Appraisal Result" urlName="performance_appraisal_result" fileName="performance_appraisal_result_file" defaultValue={assignment.performance_appraisal_result ?? ""} />
            <LinkOrFileField label="Performance Review Result" urlName="performance_review_result" fileName="performance_review_result_file" defaultValue={assignment.performance_review_result ?? ""} />
            <Field label="People Summarize" name="people_summarize" defaultValue={assignment.people_summarize ?? ""} />
            <Field label="Increment Amount Deal" name="increment_amount_deal" money defaultValue={assignment.increment_amount_deal?.toString() ?? ""} />
            <Field label="Increment % Deal" name="increment_percent_deal" type="number" defaultValue={assignment.increment_percent_deal?.toString() ?? ""} />
            <SelectField label="Status All Data" name="status_all_data_code" defaultValue={assignment.status_all_data_code ?? ""} options={STATUS_ALL_DATA_OPTIONS} />
          </FormSection>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">B-I. Tax, Salary, Allowance, BPJS & Total</h2>
              <p className="text-xs text-slate-500 mt-1">
                {t("cogsHint")}
              </p>
            </div>

            <SummaryGroup title="Price & Fix Salary">
              <SummaryField label="Price (Rp/bulan)" value={assignment.price_amount} />
              <SummaryField label="Basic Salary" value={assignment.basic_salary_amount} />
            </SummaryGroup>

            <SummaryGroup title="Variable Cost (Allowance Bulanan)">
              <SummaryField label="Functional Allowance" value={assignment.functional_allowance_amount} />
              <SummaryField label="Transport Allowance" value={assignment.transport_allowance_amount} />
              <SummaryField label="Project Allowance" value={assignment.project_allowance_amount} />
              <SummaryField label="Accommodation Allowance" value={assignment.accommodation_allowance_amount} />
              <SummaryField label={t("fieldAllowance")} value={assignment.field_allowance_amount} />
              <SummaryField label="Overtime" value={assignment.overtime_allowance_amount} />
            </SummaryGroup>

            <SummaryGroup title="Other Component">
              <SummaryField label={t("compensation")} value={assignment.kompensasi_amount} />
              <SummaryField label="THR Allocation" value={assignment.thr_allowance_amount} />
              <SummaryField label="Annual Bonus Allocation" value={assignment.annual_bonus_allowance_amount} />
              <SummaryField label="Annual Medical Reimbursement" value={assignment.annual_medical_reimbursement_amount} />
              <SummaryField label="Laptop Ownership Program" value={assignment.laptop_ownership_amount} />
              <SummaryField label="Training" value={assignment.training_amount} />
              <SummaryField label="Refreshment" value={assignment.refreshment_amount} />
            </SummaryGroup>

            <SummaryGroup title="BPJS Company Portion">
              <SummaryField label="BPJS Kesehatan (Company)" value={assignment.bpjs_kesehatan_company_amount} />
              <SummaryField label="JKK" value={assignment.jkk_amount} />
              <SummaryField label="JKM" value={assignment.jkm_amount} />
              <SummaryField label="JHT (Company)" value={assignment.jht_company_amount} />
              <SummaryField label="JKP" value={assignment.jkp_amount} />
              <SummaryField label="JP (Company)" value={assignment.jp_company_amount} />
            </SummaryGroup>

            <SummaryGroup title="BPJS Employee Portion (Deduction)">
              <SummaryField label="BPJS Kesehatan (Employee)" value={assignment.bpjs_kesehatan_employee_amount} />
              <SummaryField label="JHT (Employee)" value={assignment.jht_employee_amount} />
              <SummaryField label="JP (Employee)" value={assignment.jp_employee_amount} />
            </SummaryGroup>

            <SummaryGroup title="Tax & Total">
              <SummaryField label={t("grossTax")} value={assignment.tax_bruto_amount} />
              <SummaryField label="Gross Salary" value={assignment.gross_salary_amount} />
              <SummaryField label="Take Home Pay (Nett)" value={assignment.take_home_pay_amount} />
              <SummaryField label="Management Fee / Gross Margin" value={assignment.management_fee_amount} />
              <SummaryField label="Total COGS" value={assignment.total_cogs_amount} tone="red" />
            </SummaryGroup>

            <Link
              href={`/tm/cogs-calculator?talent_assignment_id=${assignment.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
            >
              <Calculator className="h-4 w-4" />
              {t("calculateEditLink")}
            </Link>
          </section>

          <FormSection title={t("notesSection")}>
            <div className="sm:col-span-3">
              <Field label="Notes" name="notes" defaultValue={assignment.notes ?? ""} textarea />
            </div>
          </FormSection>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/tm" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {tc("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function SummaryGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function SummaryTextField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <p className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {value || "-"}
      </p>
    </div>
  );
}

function SummaryField({ label, value, tone }: { label: string; value: number | null; tone?: "red" }) {
  return (
    <div className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <p className={`w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm ${tone === "red" ? "text-red-600 font-medium" : "text-slate-600"}`}>
        {value != null ? `Rp ${value.toLocaleString("id-ID")}` : "-"}
      </p>
    </div>
  );
}
