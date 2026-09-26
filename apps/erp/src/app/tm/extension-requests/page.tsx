import { db } from "@/db";
import { extensionIncrementRequests, employees, onboardingRequests, candidates, employmentContracts, signatureRequests, extensionRequestSpecialNotes, talentAssignments, opportunities } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createExtensionRequest } from "../actions";
import { EmployeePickerWithCurrent } from "@/components/employee-picker-with-current";
import { ExtensionRequestsTable } from "./extension-requests-table";
import { ExpandableSection } from "@/components/expandable-section";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { UserSelect } from "@/components/user-select";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { APPROVAL_STEPS, EXTENSION_REQUEST_SOURCE, getActiveUserOptions } from "@/lib/approval-journey";
import { getAttachmentsWithUrlsForMany, type AttachmentWithUrl } from "@/lib/attachments";
import { deleteExtensionRequestAttachment } from "../actions";
import { JourneyStep } from "./approval-journey";
import { TrendingUp } from "lucide-react";
import { Field, SelectField } from "@/components/form-fields";
import { getTranslations } from "next-intl/server";

const GRADE_LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
const EMPLOYMENT_TYPES = [["pkwt", "PKWT"], ["pkwtt", "PKWTT"]] as const;

export default async function ExtensionRequestsPage() {
  const t = await getTranslations("tm.extensionRequests");
  const session = await getServerSession(authOptions);
  const isOwner = Boolean((session?.user as any)?.isOwner);

  const [data, allContracts, employeeRows, allAssignments, userOptions, journeySignatures, allSpecialNotes] = await Promise.all([
    db
    .select({
      id: extensionIncrementRequests.id,
      employee_no: employees.employee_no,
      candidate_name: candidates.candidate_name,
      propose_start_date: extensionIncrementRequests.propose_start_date,
      propose_end_date: extensionIncrementRequests.propose_end_date,
      proposed_position_name: extensionIncrementRequests.proposed_position_name,
      proposed_grade_level_code: extensionIncrementRequests.proposed_grade_level_code,
      proposed_employment_type_code: extensionIncrementRequests.proposed_employment_type_code,
      proposed_basic_salary_amount: extensionIncrementRequests.proposed_basic_salary_amount,
      proposed_transport_allowance_amount: extensionIncrementRequests.proposed_transport_allowance_amount,
      proposed_project_allowance_amount: extensionIncrementRequests.proposed_project_allowance_amount,
      proposed_accommodation_allowance_amount: extensionIncrementRequests.proposed_accommodation_allowance_amount,
      proposed_overtime_allowance_amount: extensionIncrementRequests.proposed_overtime_allowance_amount,
      proposed_increment_amount_deal: extensionIncrementRequests.proposed_increment_amount_deal,
      proposed_increment_percent_deal: extensionIncrementRequests.proposed_increment_percent_deal,
      pq_tracker_id: extensionIncrementRequests.pq_tracker_id,
      pq_opty_no: opportunities.opty_no,
      requester_name: extensionIncrementRequests.requester_name,
      requester_user_id: extensionIncrementRequests.requester_user_id,
      approver_1_user_id: extensionIncrementRequests.approver_1_user_id,
      approver_2_user_id: extensionIncrementRequests.approver_2_user_id,
      approver_3_user_id: extensionIncrementRequests.approver_3_user_id,
      acknowledger_user_id: extensionIncrementRequests.acknowledger_user_id,
      status_code: extensionIncrementRequests.status_code,
      hr_status_code: extensionIncrementRequests.hr_status_code,
      owner_override: extensionIncrementRequests.owner_override,
      owner_override_by_name: extensionIncrementRequests.owner_override_by_name,
      notes: extensionIncrementRequests.notes,
    })
    .from(extensionIncrementRequests)
    .leftJoin(employees, eq(extensionIncrementRequests.employee_id, employees.id))
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .leftJoin(opportunities, eq(extensionIncrementRequests.pq_tracker_id, opportunities.id))
    .orderBy(desc(extensionIncrementRequests.created_at)),

    db.select().from(employmentContracts).orderBy(desc(employmentContracts.start_date)),

    db
    .select({
      id: employees.id,
      employee_no: employees.employee_no,
      position_name: employees.position_name,
      candidate_name: candidates.candidate_name,
      price_amount: opportunities.price_amount,
    })
    .from(employees)
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .leftJoin(opportunities, eq(opportunities.onboarding_request_id, employees.onboarding_request_id)),

    db.select().from(talentAssignments).orderBy(desc(talentAssignments.created_at)),

    getActiveUserOptions(),

    db.select().from(signatureRequests).where(eq(signatureRequests.source_type, EXTENSION_REQUEST_SOURCE)),

    db.select({ extension_request_id: extensionRequestSpecialNotes.extension_request_id, status_code: extensionRequestSpecialNotes.status_code })
        .from(extensionRequestSpecialNotes),
  ]);

  const latestContractByEmployee = new Map<string, typeof allContracts[number]>();
  for (const c of allContracts) {
    if (!latestContractByEmployee.has(c.employee_id)) latestContractByEmployee.set(c.employee_id, c);
  }

  const latestAssignmentByEmployee = new Map<string, typeof allAssignments[number]>();
  for (const a of allAssignments) {
    if (!latestAssignmentByEmployee.has(a.employee_id)) latestAssignmentByEmployee.set(a.employee_id, a);
  }

  const employeeOptions = employeeRows.map((e) => {
    const latestContract = latestContractByEmployee.get(e.id);
    const latestAssignment = latestAssignmentByEmployee.get(e.id);
    return {
      ...e,
      last_start_date: latestContract?.start_date ?? null,
      last_end_date: latestContract?.end_date ?? null,
      last_contract_no: latestContract?.contract_no ?? null,
      last_basic_salary_amount: latestAssignment?.basic_salary_amount ?? null,
      last_transport_allowance_amount: latestAssignment?.transport_allowance_amount ?? null,
      last_project_allowance_amount: latestAssignment?.project_allowance_amount ?? null,
      last_accommodation_allowance_amount: latestAssignment?.accommodation_allowance_amount ?? null,
      last_overtime_allowance_amount: latestAssignment?.overtime_allowance_amount ?? null,
      // Price dari opportunities (Sales) lebih diutamakan; kalau belum ke-link,
      // fallback ke price_amount talent assignment terkini.
      price_amount: e.price_amount ?? latestAssignment?.price_amount ?? null,
    };
  });

  const userMap = new Map(userOptions.map((u) => [u.id, u]));

  const sigByRequestAndStep = new Map<string, (typeof journeySignatures)[number]>();
  for (const s of journeySignatures) {
    if (s.source_id && s.step_code) sigByRequestAndStep.set(`${s.source_id}:${s.step_code}`, s);
  }

  const attachmentsByRequestRaw = await getAttachmentsWithUrlsForMany(EXTENSION_REQUEST_SOURCE, data.map((r) => r.id));
  const attachmentsByRequest = new Map<string, AttachmentWithUrl[]>(Object.entries(attachmentsByRequestRaw));

  const specialNotesCountByRequest = new Map<string, { total: number; open: number }>();
  for (const n of allSpecialNotes) {
    const cur = specialNotesCountByRequest.get(n.extension_request_id) ?? { total: 0, open: 0 };
    cur.total += 1;
    if (n.status_code !== "resolved") cur.open += 1;
    specialNotesCountByRequest.set(n.extension_request_id, cur);
  }

  const dataWithJourney = data.map((r) => {
    const userFieldByStep: Record<string, string | null> = {
      requester: r.requester_user_id,
      approval_1: r.approver_1_user_id,
      approval_2: r.approver_2_user_id,
      approval_3: r.approver_3_user_id,
      acknowledge: r.acknowledger_user_id,
    };
    let reachedActive = false;
    const steps: JourneyStep[] = APPROVAL_STEPS.map((stepDef) => {
      const personId = userFieldByStep[stepDef.code];
      const person = personId ? userMap.get(personId) : undefined;
      const sig = sigByRequestAndStep.get(`${r.id}:${stepDef.code}`);

      let status: JourneyStep["status"];
      if (!personId) status = "not_configured";
      else if (sig?.status_code === "signed") status = "signed";
      else if (sig?.status_code === "rejected") status = "rejected";
      else if (sig?.status_code === "pending") { status = "pending"; reachedActive = true; }
      else if (!reachedActive) { status = "pending"; reachedActive = true; }
      else status = "not_started";

      return {
        code: stepDef.code,
        label: stepDef.label,
        personName: person?.full_name ?? null,
        personEmail: person?.email ?? null,
        status,
      };
    });
    const notesCount = specialNotesCountByRequest.get(r.id) ?? { total: 0, open: 0 };
    return { ...r, journeySteps: steps, attachments: attachmentsByRequest.get(r.id) ?? [], specialNotesTotal: notesCount.total, specialNotesOpen: notesCount.open };
  });

  const pendingCount = data.filter((d) => d.status_code === "pending").length;
  const approvedCount = data.filter((d) => d.status_code === "approved").length;
  const rejectedCount = data.filter((d) => d.status_code === "rejected").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={TrendingUp}
        color="bg-blue-400"
        eyebrow="Talent Management"
        title="Extension & Increment Request"
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Request" value={data.length} color="navy" />
          <StatCard label="Pending" value={pendingCount} color="amber" />
          <StatCard label="Approved" value={approvedCount} color="green" />
          <StatCard label="Rejected" value={rejectedCount} color="red" />
        </div>

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("newRequestButton")} title={t("newRequestButton")} action={createExtensionRequest}>
            <EmployeePickerWithCurrent employees={employeeOptions} />

            <Field label="Propose Start Date" name="propose_start_date" type="date" />
            <Field label="Propose End Date" name="propose_end_date" type="date" />
            <Field label="Positions (Propose)" name="proposed_position_name" />

            <SelectField label="Grade Level (Propose)" name="proposed_grade_level_code" options={GRADE_LEVELS} />
            <SelectField label={t("employmentStatusPropose")} name="proposed_employment_type_code" options={EMPLOYMENT_TYPES} />
            <Field label="Basic Salary (Propose)" name="proposed_basic_salary_amount" money />

            <Field label="Transport Allowance (Propose)" name="proposed_transport_allowance_amount" money />
            <Field label="Project Allowance (Propose)" name="proposed_project_allowance_amount" money />
            <Field label="Accommodation Allowance (Propose)" name="proposed_accommodation_allowance_amount" money />

            <Field label="Overtime Allowance (Propose)" name="proposed_overtime_allowance_amount" money />
            <Field label="Increment Amount Deal (Propose)" name="proposed_increment_amount_deal" money hint={t("incrementAmountHint")} />
            <Field label="Increment % Deal (Propose)" name="proposed_increment_percent_deal" type="number" />

            <div className="sm:col-span-3 border-t border-slate-100 pt-4 mt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-500 mb-3">{t("approvalJourneyTitle")}</p>
            </div>
            <UserSelect name="requester_user_id" label="Requester" options={userOptions} required />
            <UserSelect name="approver_1_user_id" label="Approval 1" options={userOptions} />
            <UserSelect name="approver_2_user_id" label="Approval 2" options={userOptions} />
            <UserSelect name="approver_3_user_id" label="Approval 3" options={userOptions} />
            <UserSelect name="acknowledger_user_id" label="Acknowledge" options={userOptions} />
            <div />

            <div className="sm:col-span-3">
              <MultiFileUpload name="attachments" label={t("supportingDocuments")} />
            </div>

            <div className="sm:col-span-3">
              <Field label="Notes" name="notes" textarea />
            </div>
          </AddRecordModal>
        </div>

        <ExpandableSection title={t("listTitle", { count: data.length })}>
          <ExtensionRequestsTable data={dataWithJourney} isOwner={isOwner} userOptions={userOptions} />
        </ExpandableSection>
      </main>
    </div>
  );
}
