import { db } from "@/db";
import { talentAssignments, employees, requisitions, onboardingRequests, candidates, opportunities, employmentContracts } from "@/db/schema";
import { eq, isNotNull, asc, desc } from "drizzle-orm";
import { createTalentAssignment } from "./actions";
import { EmployeePicker } from "@/components/employee-picker";
import { TalentAssignmentsTable } from "./talent-assignments-table";
import { ExpandableSection } from "@/components/expandable-section";
import { RefreshCw, Briefcase } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { PendingTalentSetups } from "./pending-talent-setups";
import { getPendingTalentSetups } from "@/lib/pq-approval";
import { Field, SelectField } from "@/components/form-fields";
import { LinkOrFileField } from "@/components/link-or-file-field";
import { getTranslations } from "next-intl/server";

const STATUS_OPTIONS = [
  ["on_project", "On Project"], ["idle", "Idle"], ["out", "Out"], ["internal_project", "Internal Project"],
  ["resignation_on_progress", "Resignation on Progress"], ["waiting_for_project_onboard", "Waiting for Project Onboard"],
  ["not_in_assignment", "Not in Assignment"], ["promote", "Promote"],
] as const;
const TALENT_TRACKS = [["pm", "PM"], ["sad", "SAD"], ["bdcs", "BDCS"], ["das", "DAS"]] as const;
const GRADING_OPTIONS = [["g1","G1"],["g2","G2"],["g3","G3"],["g4","G4"],["g5","G5"],["g6","G6"],["g7","G7"]] as const;
const STATUS_ALL_DATA_OPTIONS = [["updated","Updated"],["will_be_update","Will be Update"],["obsolete","Obsolete"]] as const;

export default async function TalentManagementPage() {
  const t = await getTranslations("tm.talentsBook");
  const [data, employeeOptions, allContracts, requisitionOptions, pqOptions, pendingTalentSetups] = await Promise.all([
    db
    .select({
      id: talentAssignments.id,
      employee_id: talentAssignments.employee_id,
      employee_no: employees.employee_no,
      candidate_name: candidates.candidate_name,
      client_name: requisitions.client_name,
      position_name: requisitions.position_name,
      pq_no: opportunities.pq_no,
      opty_no: opportunities.opty_no,
      start_date: talentAssignments.start_date,
      end_date: talentAssignments.end_date,
      status_code: talentAssignments.status_code,
      talent_track_code: talentAssignments.talent_track_code,
      increment_date: talentAssignments.increment_date,
      current_grading: talentAssignments.current_grading,
      current_salary_grade_code: talentAssignments.current_salary_grade_code,
      price_amount: talentAssignments.price_amount,
      current_skill: talentAssignments.current_skill,
      current_certification: talentAssignments.current_certification,
      performance_appraisal_result: talentAssignments.performance_appraisal_result,
      performance_review_result: talentAssignments.performance_review_result,
      people_summarize: talentAssignments.people_summarize,
      increment_amount_deal: talentAssignments.increment_amount_deal,
      increment_percent_deal: talentAssignments.increment_percent_deal,
      status_all_data_code: talentAssignments.status_all_data_code,
      notes: talentAssignments.notes,
      tax_bruto_amount: talentAssignments.tax_bruto_amount,
      take_home_pay_amount: talentAssignments.take_home_pay_amount,
      gross_salary_amount: talentAssignments.gross_salary_amount,
      basic_salary_amount: talentAssignments.basic_salary_amount,
      functional_allowance_amount: talentAssignments.functional_allowance_amount,
      transport_allowance_amount: talentAssignments.transport_allowance_amount,
      project_allowance_amount: talentAssignments.project_allowance_amount,
      accommodation_allowance_amount: talentAssignments.accommodation_allowance_amount,
      field_allowance_amount: talentAssignments.field_allowance_amount,
      overtime_allowance_amount: talentAssignments.overtime_allowance_amount,
      kompensasi_amount: talentAssignments.kompensasi_amount,
      thr_allowance_amount: talentAssignments.thr_allowance_amount,
      annual_bonus_allowance_amount: talentAssignments.annual_bonus_allowance_amount,
      annual_medical_reimbursement_amount: talentAssignments.annual_medical_reimbursement_amount,
      laptop_ownership_amount: talentAssignments.laptop_ownership_amount,
      training_amount: talentAssignments.training_amount,
      refreshment_amount: talentAssignments.refreshment_amount,
      bpjs_kesehatan_company_amount: talentAssignments.bpjs_kesehatan_company_amount,
      jkk_amount: talentAssignments.jkk_amount,
      jkm_amount: talentAssignments.jkm_amount,
      jht_company_amount: talentAssignments.jht_company_amount,
      jkp_amount: talentAssignments.jkp_amount,
      jp_company_amount: talentAssignments.jp_company_amount,
      bpjs_kesehatan_employee_amount: talentAssignments.bpjs_kesehatan_employee_amount,
      jht_employee_amount: talentAssignments.jht_employee_amount,
      jp_employee_amount: talentAssignments.jp_employee_amount,
      management_fee_amount: talentAssignments.management_fee_amount,
      total_cogs_amount: talentAssignments.total_cogs_amount,
      created_at: talentAssignments.created_at,
    })
    .from(talentAssignments)
    .leftJoin(employees, eq(talentAssignments.employee_id, employees.id))
    .leftJoin(requisitions, eq(talentAssignments.requisition_id, requisitions.id))
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .leftJoin(opportunities, eq(talentAssignments.pq_tracker_id, opportunities.id))
    .orderBy(desc(talentAssignments.created_at)),

    db
    .select({
      id: employees.id,
      employee_no: employees.employee_no,
      position_name: employees.position_name,
      candidate_name: candidates.candidate_name,
      deal_start_date: onboardingRequests.start_date,
      deal_end_date: onboardingRequests.end_date,
      deal_price_amount: onboardingRequests.price_amount,
      deal_basic_salary_amount: onboardingRequests.basic_salary_amount,
      deal_functional_allowance_amount: onboardingRequests.functional_allowance_amount,
      deal_transport_allowance_amount: onboardingRequests.transport_allowance_amount,
      deal_project_allowance_amount: onboardingRequests.project_allowance_amount,
      deal_accommodation_allowance_amount: onboardingRequests.accommodation_allowance_amount,
      deal_field_allowance_amount: onboardingRequests.field_allowance_amount,
      deal_overtime_allowance_amount: onboardingRequests.overtime_allowance_amount,
      default_requisition_id: onboardingRequests.requisition_id,
      default_pq_tracker_id: opportunities.id,
    })
    .from(employees)
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .leftJoin(opportunities, eq(opportunities.onboarding_request_id, employees.onboarding_request_id)),

    // Kontrak paling awal (induk) per employee -- dasar hitung Increment Date otomatis (+1 tahun).
    db
    .select({ employee_id: employmentContracts.employee_id, start_date: employmentContracts.start_date })
    .from(employmentContracts)
    .orderBy(asc(employmentContracts.start_date)),

    db.select({ id: requisitions.id, client_name: requisitions.client_name, position_name: requisitions.position_name }).from(requisitions),

    db.select({
      id: opportunities.id,
      pq_no: opportunities.pq_no,
      client_name: opportunities.client_name,
      approval_date: opportunities.approval_date,
    }).from(opportunities).where(isNotNull(opportunities.onboarding_request_id)),

    getPendingTalentSetups(),
  ]);

  const earliestContractStartByEmployee = new Map<string, string>();
  for (const c of allContracts) {
    if (!earliestContractStartByEmployee.has(c.employee_id)) earliestContractStartByEmployee.set(c.employee_id, c.start_date);
  }
  const employeeOptionsWithContract = employeeOptions.map((e) => ({
    ...e,
    contract_start_date: earliestContractStartByEmployee.get(e.id) ?? null,
  }));


  const onProjectCount = data.filter((d) => d.status_code === "on_project").length;
  const idleCount = data.filter((d) => d.status_code === "idle").length;
  const outCount = data.filter((d) => d.status_code === "out").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Briefcase}
        color="bg-blue-400"
        eyebrow="Talent Management"
        title="Talents Book"
        subtitle={t("subtitle")}
      >
        <Link
          href="/tm/sheet-sync"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Google Sheet Sync
        </Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Assignment" value={data.length} color="navy" />
          <StatCard label="On Project" value={onProjectCount} color="green" />
          <StatCard label="Idle" value={idleCount} color="amber" />
          <StatCard label="Out" value={outCount} color="red" />
        </div>

        <PendingTalentSetups items={pendingTalentSetups} />

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("addButton")} title={t("addButton")} action={createTalentAssignment}>
            <EmployeePicker employees={employeeOptionsWithContract} requisitionOptions={requisitionOptions} pqOptions={pqOptions} />

            <SelectField label="Status" name="status_code" options={STATUS_OPTIONS} />
            <SelectField label="Talent Track" name="talent_track_code" options={TALENT_TRACKS} />
            <SelectField label="Current Grading" name="current_grading" options={GRADING_OPTIONS} />

            <SelectField label="Current Salary Grade" name="current_salary_grade_code" options={GRADING_OPTIONS} />
            <Field label="Current Skill" name="current_skill" />
            <Field label="Current Certification" name="current_certification" />

            <LinkOrFileField label="Performance Appraisal Result" urlName="performance_appraisal_result" fileName="performance_appraisal_result_file" />
            <LinkOrFileField label="Performance Review Result" urlName="performance_review_result" fileName="performance_review_result_file" />
            <Field label="People Summarize" name="people_summarize" />
            <Field label="Increment Amount Deal" name="increment_amount_deal" money />
            <Field label="Increment % Deal" name="increment_percent_deal" type="number" />
            <SelectField label="Status All Data" name="status_all_data_code" options={STATUS_ALL_DATA_OPTIONS} />

            <div className="sm:col-span-3">
              <Field label="Notes" name="notes" textarea />
            </div>
          </AddRecordModal>
        </div>

        <ExpandableSection title={t("listTitle", { count: data.length })}>
          <TalentAssignmentsTable data={data} />
        </ExpandableSection>
      </main>
    </div>
  );
}
