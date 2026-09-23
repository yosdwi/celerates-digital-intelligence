import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { salesOpportunityTrackers, leads, employees, onboardingRequests, candidates, opportunities } from "@/db/schema";
import { desc, eq, isNotNull } from "drizzle-orm";
import { createOpportunityTracker } from "./actions";
import { createExtensionRequestFromSales } from "../actions";
import { TrackerViewTabs } from "./tracker-view-tabs";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Target } from "lucide-react";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field, SelectField } from "@/components/form-fields";
import { LeadPicker } from "@/components/lead-picker";

const SERVICE_TYPES = [
  ["outsourcing", "Outsourcing"], ["headhunting", "Headhunting"], ["outplacement", "Outplacement"],
  ["managed_service", "Managed Service"], ["project_based", "Project Based"], ["rpo", "RPO"],
  ["training", "Training"], ["license", "License"], ["hardware", "Hardware"],
] as const;
const CLIENT_TYPES = [["existing", "Existing"], ["new", "New"]] as const;
const BANTE_SCORES = [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]] as const;
const PRICE_PERIODS = [
  ["monthly", "Per Bulan"], ["project", "Per Project"], ["yearly", "Per Tahun"], ["daily", "Per Hari"],
] as const;

const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
const BUSINESS_UNITS = [["tm", "TM"], ["cs", "CS"], ["solution", "SOLUTION"], ["other", "Other"]] as const;
const PRIORITIES = [["p0", "P0"], ["p1", "P1"], ["p2", "P2"], ["p3", "P3"]] as const;

export default async function OpportunityTrackerPage() {
  const t = await getTranslations("sales.opportunityTracker");
  const [data, converted, leadOptions, positionRows, employeeRows] = await Promise.all([
    db
      .select({
        id: salesOpportunityTrackers.id,
        lead_id: salesOpportunityTrackers.lead_id,
        opty_no: salesOpportunityTrackers.opty_no,
        client_name: salesOpportunityTrackers.client_name,
        service_type_code: salesOpportunityTrackers.service_type_code,
        requirement_summary: salesOpportunityTrackers.requirement_summary,
        opty_status_code: salesOpportunityTrackers.opty_status_code,
        progress_notes: salesOpportunityTrackers.progress_notes,
        estimated_deal_amount: salesOpportunityTrackers.estimated_deal_amount,
        detail_requirement: salesOpportunityTrackers.detail_requirement,
        client_type_code: salesOpportunityTrackers.client_type_code,
        sales_pic_name: salesOpportunityTrackers.sales_pic_name,
        last_communication_date: salesOpportunityTrackers.last_communication_date,
        bante_score: salesOpportunityTrackers.bante_score,
        sales_qualified: salesOpportunityTrackers.sales_qualified,
        dropped_reason: salesOpportunityTrackers.dropped_reason,
        position_name: salesOpportunityTrackers.position_name,
        level_code: salesOpportunityTrackers.level_code,
        headcount_target: salesOpportunityTrackers.headcount_target,
        price_amount: salesOpportunityTrackers.price_amount,
        price_period_code: salesOpportunityTrackers.price_period_code,
        estimated_duration_months: salesOpportunityTrackers.estimated_duration_months,
        created_at: salesOpportunityTrackers.created_at,
        lead_no: leads.lead_no,
      })
      .from(salesOpportunityTrackers)
      .leftJoin(leads, eq(salesOpportunityTrackers.lead_id, leads.id))
      .orderBy(desc(salesOpportunityTrackers.created_at)),
    // "Sudah dikonversi" ditentukan dari sudah adanya PQ Tracker (opportunities)
    // yang ke-link ke tracker ini -- bukan cuma dari Requisition, karena flow
    // "Add Extension Request" bikin PQ Tracker LANGSUNG tanpa lewat Requisition
    // sama sekali (skip Talent Acquisition), tapi tombol Convert tetap harus
    // hilang buat tracker itu (PQ-nya sudah ada, jangan di-convert lagi).
    db.select({ opportunity_id: opportunities.opportunity_tracker_id }).from(opportunities).where(isNotNull(opportunities.opportunity_tracker_id)),
    db.select({ id: leads.id, lead_no: leads.lead_no, client_name: leads.client_name }).from(leads),
    db.select({ position_name: salesOpportunityTrackers.position_name }).from(salesOpportunityTrackers).where(isNotNull(salesOpportunityTrackers.position_name)),
    // Buat dropdown talent di form "Add Extension Request" -- sama persis
    // datanya kayak yang dipakai TM sendiri di New Request mereka.
    db
      .select({ id: employees.id, employee_no: employees.employee_no, candidate_name: candidates.candidate_name, position_name: employees.position_name })
      .from(employees)
      .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
      .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id)),
  ]);
  const convertedIds = converted.map((c) => c.opportunity_id).filter((id): id is string => id !== null);

  const positionSuggestions = Array.from(new Set(positionRows.map((r) => r.position_name).filter((p): p is string => !!p?.trim()))).sort();
  const employeeOptions = employeeRows.map((e) => [e.id, `${e.employee_no} - ${e.candidate_name ?? "-"}${e.position_name ? ` (${e.position_name})` : ""}`] as const);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Target}
        color="bg-blue-500"
        eyebrow="Sales"
        title="Opportunity Tracker"
        subtitle={t("subtitle")}
      >
        <Link
          href="/sales/opportunity-tracker/sheet-sync"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Google Sheet Sync
        </Link>
      </PageHeader>

        <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Opportunity" value={data.length} color="navy" />
          <StatCard label="Sales Qualified" value={data.filter((d) => d.sales_qualified).length} color="green" />
          <StatCard label={t("statAlreadyWin")} value={data.filter((d) => d.opty_status_code === "win").length} color="blue" />
          <StatCard label="Dropped" value={data.filter((d) => d.opty_status_code === "dropped").length} color="red" />
        </div>

        <div className="flex justify-end gap-2">
          <AddRecordModal buttonLabel="Add Extension Request" title="Add Extension Request" action={createExtensionRequestFromSales}>
            <div className="sm:col-span-3">
              <SelectField label="Talent yang di-extend" name="employee_id" options={employeeOptions} required />
              <p className="mt-1 text-xs text-slate-400">Bikin PQ baru buat deal perpanjangan ini + otomatis masuk sebagai request pending di TM Extension Request (TM lengkapi rincian gaji & approval chain-nya).</p>
            </div>

            <Field label="Client Name" name="client_name" required />
            <SelectField label="Client Type" name="client_type_code" options={CLIENT_TYPES} />
            <Field label="Project Name" name="project_name" required />

            <Field label="Positions" name="position_name" suggestions={positionSuggestions} />
            <SelectField label="Service Type" name="service_type_code" required options={SERVICE_TYPES} />
            <SelectField label="Business Unit" name="business_unit_code" options={BUSINESS_UNITS} />

            <SelectField label="Level" name="level_code" options={LEVELS} />
            <Field label="Headcount" name="headcount_target" type="number" />
            <Field label="Estimasi Durasi (bulan)" name="estimated_duration_months" type="number" />

            <SelectField label="Priority" name="priority_code" options={PRIORITIES} />
            <Field label="Price" name="price_amount" money />
            <SelectField label="Price Period" name="price_period_code" defaultValue="monthly" options={PRICE_PERIODS} />

            <Field label="Sales PIC" name="sales_pic_name" required />
            <Field label="Start Date" name="start_date" type="date" />
            <Field label="End Date" name="end_date" type="date" />

            <div className="sm:col-span-3">
              <Field label="Notes" name="notes" textarea />
            </div>
          </AddRecordModal>

          <AddRecordModal buttonLabel={t("addNew")} title={t("addNew")} action={createOpportunityTracker}>
            <LeadPicker leads={leadOptions} />
            <SelectField label="Client Type" name="client_type_code" options={CLIENT_TYPES} />
            <SelectField label="Service Type" name="service_type_code" options={SERVICE_TYPES} />

            <Field label="Sales PIC" name="sales_pic_name" required />
            <Field label="Positions" name="position_name" suggestions={positionSuggestions} />
            <SelectField label="Level" name="level_code" options={LEVELS} />
            <Field label="Headcount" name="headcount_target" type="number" />
            <Field label="Estimasi Durasi (bulan)" name="estimated_duration_months" type="number" />
            <Field label={t("fields.price")} name="price_amount" money />
            <SelectField label={t("fields.pricePeriod")} name="price_period_code" defaultValue="monthly" options={PRICE_PERIODS} />
            <Field label="Closing Price Deal" name="estimated_deal_amount" money />
            <SelectField label="BANTE Score" name="bante_score" options={BANTE_SCORES} />

            <Field label="Last Communication" name="last_communication_date" type="date" />
            <label className="flex items-center gap-2 pt-6">
              <input type="checkbox" name="sales_qualified" value="true" className="rounded border-slate-300" />
              <span className="text-sm font-medium text-slate-700">Sales Qualified</span>
            </label>
            <div />

            <div className="sm:col-span-3">
              <Field label="Requirement Summary" name="requirement_summary" textarea />
            </div>
            <div className="sm:col-span-3">
              <Field label="Detail Requirement" name="detail_requirement" textarea />
            </div>
          </AddRecordModal>
        </div>

        <TrackerViewTabs data={data} convertedIds={convertedIds} />
      </main>
    </div>
  );
}
