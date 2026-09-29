import { db } from "@/db";
import { requisitions, salesOpportunityTrackers, opportunities } from "@/db/schema";
import { getPicNames } from "@/lib/reference-data";
import { eq, getTableColumns, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { updateRequisition } from "../../actions";
import Link from "next/link";
import { PicSelect } from "@/components/pic-select";
import { Field, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";

// Sama seperti PRICE_PERIODS di src/app/sales/page.tsx & sales/[id]/edit/page.tsx.
function getPricePeriodLabels(t: (key: string) => string): Record<string, string> {
  return {
    monthly: t("pricePeriodMonthly"),
    project: t("pricePeriodProject"),
    yearly: t("pricePeriodYearly"),
    daily: t("pricePeriodDaily"),
  };
}

// Sama seperti monthsBetween di src/components/opportunity-picker.tsx.
function monthsBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

/** Field read-only ala SummaryField di tm/[id]/edit/page.tsx, dipakai lokal di sini. */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{value}</p>
    </div>
  );
}

const SERVICE_TYPES = [
  ["outsourcing", "Outsourcing"], ["headhunting", "Headhunting"], ["outplacement", "Outplacement"],
  ["managed_service", "Managed Service"], ["project_based", "Project Based"], ["rpo", "RPO"],
  ["training", "Training"], ["license", "License"], ["hardware", "Hardware"], ["replacement", "Replacement"],
] as const;
const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
const OPTY_STATUS = [
  ["on_hold", "Project on Hold"], ["client_not_responding", "Client Not Responding"],
  ["lost_pitching", "Lost on Pitching Period"], ["waiting_feedback", "Waiting for Feedback"],
  ["budget_on_hold", "Client Budget on Hold"], ["won", "Project Won"],
  ["closed_lost", "Closed Lost"], ["on_going_others", "Opty on Going Others"],
] as const;
const PRIORITIES = [["p0", "P0"], ["p1", "P1"], ["p2", "P2"], ["p3", "P3"]] as const;

export default async function EditRequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("ta.requisitions");
  const tc = await getTranslations("common");
  const [req] = await db
    .select({
      ...getTableColumns(requisitions),
      tracker_price_period_code: salesOpportunityTrackers.price_period_code,
      tracker_detail_requirement: salesOpportunityTrackers.detail_requirement,
      opp_start_date: opportunities.start_date,
      opp_end_date: opportunities.end_date,
    })
    .from(requisitions)
    .leftJoin(salesOpportunityTrackers, eq(requisitions.opportunity_id, salesOpportunityTrackers.id))
    .leftJoin(
      opportunities,
      or(
        eq(requisitions.opportunity_id, opportunities.opportunity_tracker_id),
        eq(requisitions.opportunity_id, opportunities.id)
      )
    )
    .where(eq(requisitions.id, id));
  if (!req) notFound();

  const updateRequisitionWithId = updateRequisition.bind(null, id);

  const picNames = await getPicNames();

  const priceRangeLabel = req.tracker_price_period_code
    ? (getPricePeriodLabels(t)[req.tracker_price_period_code] ?? req.tracker_price_period_code)
    : "-";
  const durationLabel = req.opp_start_date && req.opp_end_date
    ? t("durationFormat", {
        count: monthsBetween(req.opp_start_date, req.opp_end_date),
        start: req.opp_start_date,
        end: req.opp_end_date,
      })
    : "-";

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-amber-500" eyebrow="Talent Acquisition" title={t("editTitle", { no: req.requisition_no })}>
        <Link href="/ta" className="text-sm font-medium text-amber-700 hover:underline">&larr; {t("backToList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-3xl mx-auto space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">{t("infoFromSales")}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ReadOnlyField label={t("projectDuration")} value={durationLabel} />
            <ReadOnlyField label={t("pricePeriod")} value={priceRangeLabel} />
            <div className="sm:col-span-1">
              <ReadOnlyField label={t("detailRequirement")} value={req.tracker_detail_requirement ?? "-"} />
            </div>
          </div>
        </div>

        <form action={updateRequisitionWithId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label="Opty Request Date" name="opty_request_date" type="date" defaultValue={req.opty_request_date ?? ""} />
          <Field label={t("clientName")} name="client_name" defaultValue={req.client_name} required />
          <Field label="Positions" name="position_name" defaultValue={req.position_name} required />

          <SelectField label="Services Type" name="service_type_code" defaultValue={req.service_type_code ?? ""} options={SERVICE_TYPES} />
          <SelectField label="Level" name="level_code" defaultValue={req.level_code ?? ""} options={LEVELS} />
          <SelectField label="Opty Status" name="opty_status_code" defaultValue={req.opty_status_code ?? ""} options={OPTY_STATUS} />

          <Field label="Headcount" name="headcount_target" type="number" defaultValue={req.headcount_target.toString()} />
          <SelectField label="Opty Priority" name="priority_code" defaultValue={req.priority_code} options={PRIORITIES} />
          <Field label="Price" name="price_amount" money defaultValue={req.price_amount?.toString() ?? ""} />
          <Field label="Estimasi Durasi (bulan)" name="estimated_duration_months" type="number" defaultValue={req.estimated_duration_months?.toString() ?? ""} />

          <PicSelect name="ta_pic_name" label="TA PIC" defaultValue={req.ta_pic_name} options={picNames} required currentPath={`/ta/${id}/edit`} />
          <Field label="Sales PIC" name="sales_pic_name" defaultValue={req.sales_pic_name ?? ""} />
          <div className="sm:col-span-1">
            <Field label={t("projectName")} name="notes" defaultValue={req.notes ?? ""} textarea />
          </div>

          <div className="sm:col-span-3 flex gap-3 pt-2">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/ta" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {tc("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
