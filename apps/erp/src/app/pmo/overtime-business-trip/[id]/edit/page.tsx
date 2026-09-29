import { db } from "@/db";
import { overtimeBusinessTripClaims, opportunities, employees, candidates, onboardingRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { updateClaim } from "../../actions";
import { CLAIM_TYPES } from "../../constants";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";

const PROGRESS_OPTIONS = [["not_started", "Not Started"], ["on_progress", "On Progress"], ["done", "Done"]] as const;

export default async function EditClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("pmo.overtimeBusinessTrip");
  const tc = await getTranslations("common");
  const { id } = await params;
  const [claim] = await db.select().from(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.id, id));
  if (!claim) notFound();

  const [opportunityOptions, employeeOptions] = await Promise.all([
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

  const updateWithId = updateClaim.bind(null, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-orange-500" eyebrow="PMO" title={t("editClaimTitle", { claimNo: claim.claim_no })}>
        <Link href="/pmo/overtime-business-trip" className="text-sm font-medium text-orange-700 hover:underline">&larr; {t("backToClaimsList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-4xl mx-auto">
        <form action={updateWithId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <SelectField label={t("fieldClaimType")} name="claim_type_code" defaultValue={claim.claim_type_code} options={CLAIM_TYPES} required />
          <div className="sm:col-span-2">
            <Field label={t("fieldClaimTitle")} name="claim_title" defaultValue={claim.claim_title} required />
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{t("fieldOpportunityProject")}</span>
            <select name="opportunity_id" defaultValue={claim.opportunity_id ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">{t("selectPlaceholder")}</option>
              {opportunityOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.client_name} - {o.project_name} ({o.opty_no})</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">{t("fieldTalent")}</span>
            <select name="employee_id" defaultValue={claim.employee_id ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">{t("selectPlaceholder")}</option>
              {employeeOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.candidate_name ?? "-"} ({e.employee_no})</option>
              ))}
            </select>
          </label>

          <Field label={t("fieldDaysCount")} name="days_count" type="number" defaultValue={claim.days_count?.toString() ?? ""} />
          <Field label="Start Date" name="start_date" type="date" defaultValue={claim.start_date ?? ""} />
          <Field label="End Date" name="end_date" type="date" defaultValue={claim.end_date ?? ""} />

          <Field label={t("fieldDurationClient")} name="duration_hours_client" type="number" defaultValue={claim.duration_hours_client?.toString() ?? ""} />
          <Field label={t("fieldDurationPmoBasic")} name="duration_hours_pmo_basic" type="number" defaultValue={claim.duration_hours_pmo_basic?.toString() ?? ""} />
          <Field label={t("fieldDurationPayroll")} name="duration_hours_payroll" type="number" defaultValue={claim.duration_hours_payroll?.toString() ?? ""} />

          <Field label={t("fieldSpkLink")} name="spk_url" defaultValue={claim.spk_url ?? ""} />
          <Field label={t("fieldTimesheetLink")} name="timesheet_url" defaultValue={claim.timesheet_url ?? ""} />
          <Field label={t("fieldDraftTimesheetLink")} name="draft_timesheet_url" defaultValue={claim.draft_timesheet_url ?? ""} />

          <Field label="PQ Submit Date" name="pq_submit_date" type="date" defaultValue={claim.pq_submit_date ?? ""} />
          <SelectField label="PQ Status" name="pq_status_code" defaultValue={claim.pq_status_code ?? ""} options={PROGRESS_OPTIONS} />
          <SelectField label="PO Status" name="po_status_code" defaultValue={claim.po_status_code ?? ""} options={PROGRESS_OPTIONS} />

          <SelectField label="CR Status" name="cr_status_code" defaultValue={claim.cr_status_code ?? ""} options={PROGRESS_OPTIONS} />
          <Field label="PIC 1 (PMO)" name="pic_1_name" defaultValue={claim.pic_1_name ?? ""} />
          <div />

          <div className="sm:col-span-3 border-t border-slate-100 pt-4 mt-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-500 mb-3">{t("sectionAmountsHeading")}</p>
          </div>
          <Field label={t("fieldAmountGivenToTalent")} name="amount_given_to_talent_initial" money defaultValue={claim.amount_given_to_talent_initial?.toString() ?? ""} />
          <Field label={t("fieldTotalClaimToClient")} name="amount_claim_to_client_total" money defaultValue={claim.amount_claim_to_client_total?.toString() ?? ""} />
          <div />

          <Field label={t("fieldAmountBtMedical")} name="amount_bt_medical_to_client" money defaultValue={claim.amount_bt_medical_to_client?.toString() ?? ""} />
          <Field label={t("fieldAmountPocketMoney")} name="amount_uang_saku_celerates" money defaultValue={claim.amount_uang_saku_celerates?.toString() ?? ""} />
          <Field label={t("fieldAmountTransport")} name="amount_transport" money defaultValue={claim.amount_transport?.toString() ?? ""} />

          <Field label={t("fieldAmountOverBaggage")} name="amount_over_bagasi" money defaultValue={claim.amount_over_bagasi?.toString() ?? ""} />
          <Field label={t("fieldAmountEtc")} name="amount_etc" money defaultValue={claim.amount_etc?.toString() ?? ""} />
          <div />

          <div className="sm:col-span-3">
            <Field label="Notes" name="notes" defaultValue={claim.notes ?? ""} textarea />
          </div>

          <div className="sm:col-span-3 flex gap-3 pt-2">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/pmo/overtime-business-trip" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {tc("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
