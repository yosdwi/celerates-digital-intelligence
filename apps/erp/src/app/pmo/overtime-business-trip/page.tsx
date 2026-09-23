import { db } from "@/db";
import { overtimeBusinessTripClaims, opportunities, employees, candidates, onboardingRequests } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/lib/auth";
import { createClaim } from "./actions";
import { CLAIM_TYPES } from "./constants";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field, SelectField } from "@/components/form-fields";
import { ClaimsTable } from "./claims-table";
import { ExpandableSection } from "@/components/expandable-section";
import { Plane } from "lucide-react";

export default async function OvertimeBusinessTripPage() {
  const t = await getTranslations("pmo.overtimeBusinessTrip");
  const session = await getServerSession(authOptions);
  const isOwner = Boolean((session?.user as any)?.isOwner);
  const access = ((session?.user as any)?.access ?? []) as { divisionKey: string; level: string }[];
  const myKeys = new Set(access.map((a) => a.divisionKey));
  const canPmo = isOwner || myKeys.has("pmo");
  const canSales = isOwner || myKeys.has("sales");
  const canFinance = isOwner || myKeys.has("finance");
  const canHr = isOwner || myKeys.has("hr");

  const [rows, opportunityOptions, employeeOptions] = await Promise.all([
    db
    .select({
      id: overtimeBusinessTripClaims.id,
      claim_no: overtimeBusinessTripClaims.claim_no,
      opportunity_id: overtimeBusinessTripClaims.opportunity_id,
      employee_id: overtimeBusinessTripClaims.employee_id,
      claim_type_code: overtimeBusinessTripClaims.claim_type_code,
      claim_title: overtimeBusinessTripClaims.claim_title,
      days_count: overtimeBusinessTripClaims.days_count,
      start_date: overtimeBusinessTripClaims.start_date,
      end_date: overtimeBusinessTripClaims.end_date,
      duration_hours_client: overtimeBusinessTripClaims.duration_hours_client,
      duration_hours_pmo_basic: overtimeBusinessTripClaims.duration_hours_pmo_basic,
      duration_hours_payroll: overtimeBusinessTripClaims.duration_hours_payroll,
      spk_url: overtimeBusinessTripClaims.spk_url,
      timesheet_url: overtimeBusinessTripClaims.timesheet_url,
      draft_timesheet_url: overtimeBusinessTripClaims.draft_timesheet_url,
      pq_submit_date: overtimeBusinessTripClaims.pq_submit_date,
      pq_status_code: overtimeBusinessTripClaims.pq_status_code,
      po_status_code: overtimeBusinessTripClaims.po_status_code,
      cr_status_code: overtimeBusinessTripClaims.cr_status_code,
      pic_1_name: overtimeBusinessTripClaims.pic_1_name,
      pic_2_name: overtimeBusinessTripClaims.pic_2_name,
      amount_given_to_talent_initial: overtimeBusinessTripClaims.amount_given_to_talent_initial,
      given_to_talent_initial_date: overtimeBusinessTripClaims.given_to_talent_initial_date,
      amount_claim_to_client_total: overtimeBusinessTripClaims.amount_claim_to_client_total,
      amount_bt_medical_to_client: overtimeBusinessTripClaims.amount_bt_medical_to_client,
      amount_uang_saku_celerates: overtimeBusinessTripClaims.amount_uang_saku_celerates,
      amount_transport: overtimeBusinessTripClaims.amount_transport,
      amount_over_bagasi: overtimeBusinessTripClaims.amount_over_bagasi,
      amount_etc: overtimeBusinessTripClaims.amount_etc,
      amount_total_given_to_talent: overtimeBusinessTripClaims.amount_total_given_to_talent,
      talent_payment_status_code: overtimeBusinessTripClaims.talent_payment_status_code,
      talent_payment_date: overtimeBusinessTripClaims.talent_payment_date,
      invoice_no: overtimeBusinessTripClaims.invoice_no,
      amount_total_billed_to_client: overtimeBusinessTripClaims.amount_total_billed_to_client,
      billing_status_code: overtimeBusinessTripClaims.billing_status_code,
      status_code: overtimeBusinessTripClaims.status_code,
      notes: overtimeBusinessTripClaims.notes,
      created_at: overtimeBusinessTripClaims.created_at,
      opty_no: opportunities.opty_no,
      client_name: opportunities.client_name,
      project_name: opportunities.project_name,
      employee_no: employees.employee_no,
      candidate_name: candidates.candidate_name,
    })
    .from(overtimeBusinessTripClaims)
    .leftJoin(opportunities, eq(overtimeBusinessTripClaims.opportunity_id, opportunities.id))
    .leftJoin(employees, eq(overtimeBusinessTripClaims.employee_id, employees.id))
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .orderBy(desc(overtimeBusinessTripClaims.created_at)),
    db.select({
      id: opportunities.id,
      opty_no: opportunities.opty_no,
      client_name: opportunities.client_name,
      project_name: opportunities.project_name,
    }).from(opportunities),
    db.select({
      id: employees.id,
      employee_no: employees.employee_no,
      candidate_name: candidates.candidate_name,
    })
      .from(employees)
      .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
      .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id)),
  ]);

  const totalDraft = rows.filter((r) => r.status_code === "draft").length;
  const totalForwarded = rows.filter((r) => r.status_code === "forwarded_to_sales").length;
  const totalAtFinance = rows.filter((r) => r.status_code === "submitted_to_finance").length;
  const totalInvoiced = rows.filter((r) => r.status_code === "invoiced").length;
  const totalTalentPending = rows.filter((r) => r.talent_payment_status_code === "pending").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Plane}
        color="bg-orange-500"
        eyebrow={t("pageEyebrow")}
        title="Overtime & Business Trip"
        subtitle={t("pageSubtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label={t("statTotalClaims")} value={rows.length} color="navy" />
          <StatCard label={t("statDraftPmo")} value={totalDraft} color="slate" />
          <StatCard label={t("statAtSales")} value={totalForwarded} color="blue" />
          <StatCard label={t("statAtFinance")} value={totalAtFinance} color="purple" />
          <StatCard label={t("statInvoiced")} value={totalInvoiced} color="green" />
          <StatCard label={t("statTalentPaymentPending")} value={totalTalentPending} color="amber" />
        </div>

        {canPmo && (
          <div className="flex justify-end">
            <AddRecordModal buttonLabel={t("addClaimButton")} title={t("addClaimModalTitle")} action={createClaim}>
              <SelectField label={t("fieldClaimType")} name="claim_type_code" options={CLAIM_TYPES} required />
              <div className="sm:col-span-2">
                <Field label={t("fieldClaimTitle")} name="claim_title" required placeholder={t("claimTitlePlaceholder")} />
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">{t("fieldOpportunityProject")}</span>
                <select name="opportunity_id" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                  <option value="">{t("selectPlaceholder")}</option>
                  {opportunityOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.client_name} - {o.project_name} ({o.opty_no})</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">{t("fieldTalent")}</span>
                <select name="employee_id" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                  <option value="">{t("selectPlaceholder")}</option>
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.id}>{e.candidate_name ?? "-"} ({e.employee_no})</option>
                  ))}
                </select>
              </label>

              <Field label={t("fieldDaysCount")} name="days_count" type="number" />
              <Field label="Start Date" name="start_date" type="date" />
              <Field label="End Date" name="end_date" type="date" />

              <Field label={t("fieldDurationClient")} name="duration_hours_client" type="number" />
              <Field label={t("fieldDurationPmoBasic")} name="duration_hours_pmo_basic" type="number" />
              <Field label={t("fieldDurationPayroll")} name="duration_hours_payroll" type="number" />

              <Field label={t("fieldSpkLink")} name="spk_url" />
              <Field label={t("fieldTimesheetLink")} name="timesheet_url" />
              <Field label={t("fieldDraftTimesheetLink")} name="draft_timesheet_url" />

              <Field label="PQ Submit Date" name="pq_submit_date" type="date" />
              <SelectField label="PQ Status" name="pq_status_code" options={[["not_started","Not Started"],["on_progress","On Progress"],["done","Done"]]} />
              <SelectField label="PO Status" name="po_status_code" options={[["not_started","Not Started"],["on_progress","On Progress"],["done","Done"]]} />

              <SelectField label="CR Status" name="cr_status_code" options={[["not_started","Not Started"],["on_progress","On Progress"],["done","Done"]]} />
              <Field label="PIC 1 (PMO)" name="pic_1_name" />
              <div />

              <div className="sm:col-span-3 border-t border-slate-100 pt-4 mt-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-500 mb-3">{t("sectionAmountsHeading")}</p>
              </div>
              <Field label={t("fieldAmountGivenToTalent")} name="amount_given_to_talent_initial" money />
              <Field label={t("fieldTotalClaimToClient")} name="amount_claim_to_client_total" money />
              <div />

              <Field label={t("fieldAmountBtMedical")} name="amount_bt_medical_to_client" money />
              <Field label={t("fieldAmountPocketMoney")} name="amount_uang_saku_celerates" money />
              <Field label={t("fieldAmountTransport")} name="amount_transport" money />

              <Field label={t("fieldAmountOverBaggage")} name="amount_over_bagasi" money />
              <Field label={t("fieldAmountEtc")} name="amount_etc" money />
              <div />

              <div className="sm:col-span-3">
                <Field label="Notes" name="notes" textarea />
              </div>
            </AddRecordModal>
          </div>
        )}

        <ExpandableSection title={t("claimsListTitle", { count: rows.length })}>
          <ClaimsTable data={rows} canPmo={canPmo} canSales={canSales} canFinance={canFinance} canHr={canHr} />
        </ExpandableSection>
      </main>
    </div>
  );
}
