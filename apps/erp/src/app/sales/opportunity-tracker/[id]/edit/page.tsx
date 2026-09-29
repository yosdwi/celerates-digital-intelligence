import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { salesOpportunityTrackers, leads } from "@/db/schema";
import { eq, isNotNull, getTableColumns } from "drizzle-orm";
import { notFound } from "next/navigation";
import { updateOpportunityTracker } from "../../actions";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";

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
const OPTY_STATUS_OPTIONS = [
  ["cv_submission", "CV Submission"], ["solutioning", "Solutioning"],
  ["proposal_sent", "Proposal Sent"], ["win", "Win"], ["dropped", "Dropped"],
  ["need_action", "Need Action"],
] as const;

const LEVELS = [
    ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
    ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
  ] as const;

const PRICE_PERIOD_LABELS: Record<string, string> = Object.fromEntries(PRICE_PERIODS);
const LEVEL_LABELS: Record<string, string> = Object.fromEntries(LEVELS);

export default async function EditOpportunityTrackerPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("sales.opportunityTracker");
  const { id } = await params;
  const [tracker] = await db
    .select({
      ...getTableColumns(salesOpportunityTrackers),
      lead_position_name: leads.position_name,
      lead_level_code: leads.level_code,
      lead_headcount_target: leads.headcount_target,
      lead_price_amount: leads.price_amount,
      lead_price_period_code: leads.price_period_code,
      lead_estimated_duration_months: leads.estimated_duration_months,
      lead_project_name: leads.project_name,
      lead_notes: leads.notes,
    })
    .from(salesOpportunityTrackers)
    .leftJoin(leads, eq(salesOpportunityTrackers.lead_id, leads.id))
    .where(eq(salesOpportunityTrackers.id, id));
  if (!tracker) notFound();

  // Tracker yang berasal dari convert Marketing Lead (`lead_id` terisi) --
  // Position/Level/Headcount/Harga/Requirement Summary/Detail Requirement
  // ditampilkan read-only diambil LANGSUNG dari Lead (bukan salinan tracker
  // sendiri yang bisa basi), karena Lead adalah sumber kebenaran buat tracker
  // hasil convert. Tracker yang dibuat langsung di Sales (tanpa Lead) tetap
  // pakai input editable seperti biasa.
  const fromLead = !!tracker.lead_id;

  const positionRows = await db.select({ position_name: salesOpportunityTrackers.position_name }).from(salesOpportunityTrackers).where(isNotNull(salesOpportunityTrackers.position_name));
  const positionSuggestions = Array.from(new Set(positionRows.map((r) => r.position_name).filter((p): p is string => !!p?.trim()))).sort();

  const updateWithId = updateOpportunityTracker.bind(null, id);

  const leadPositionName = tracker.lead_position_name ?? "-";
  const leadLevelCode = tracker.lead_level_code ?? "";
  const leadHeadcountTarget = tracker.lead_headcount_target;
  const leadPriceAmount = tracker.lead_price_amount;
  const leadPricePeriodCode = tracker.lead_price_period_code ?? "monthly";
  const leadDurationMonths = tracker.lead_estimated_duration_months;
  const leadProjectName = tracker.lead_project_name ?? "";
  const leadNotes = tracker.lead_notes ?? "";

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-blue-500" eyebrow="Sales" title={t("editTitle", { optyNo: tracker.opty_no })}>
        <Link href="/sales/opportunity-tracker" className="text-sm font-medium text-blue-700 hover:underline">&larr; {t("backToList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-3xl mx-auto">
        <form action={updateWithId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label={t("fields.clientName")} name="client_name" defaultValue={tracker.client_name} required />
          <SelectField label="Client Type" name="client_type_code" defaultValue={tracker.client_type_code ?? ""} options={CLIENT_TYPES} />
          <SelectField label="Service Type" name="service_type_code" defaultValue={tracker.service_type_code ?? ""} options={SERVICE_TYPES} />

          <Field label="Sales PIC" name="sales_pic_name" defaultValue={tracker.sales_pic_name} required />
          {fromLead ? (
            <>
              <SummaryField label="Positions" value={leadPositionName} />
              <input type="hidden" name="position_name" value={leadPositionName === "-" ? "" : leadPositionName} />
              <SummaryField label="Level" value={LEVEL_LABELS[leadLevelCode] ?? (leadLevelCode || "-")} />
              <input type="hidden" name="level_code" value={leadLevelCode} />
              <SummaryField label="Headcount" value={leadHeadcountTarget ?? "-"} />
              <input type="hidden" name="headcount_target" value={leadHeadcountTarget?.toString() ?? ""} />
              <SummaryField label={t("fields.price")} value={leadPriceAmount != null ? `Rp ${leadPriceAmount.toLocaleString("id-ID")}` : "-"} />
              <input type="hidden" name="price_amount" value={leadPriceAmount?.toString() ?? ""} />
              <SummaryField label={t("fields.pricePeriod")} value={PRICE_PERIOD_LABELS[leadPricePeriodCode] ?? leadPricePeriodCode} />
              <input type="hidden" name="price_period_code" value={leadPricePeriodCode} />
              <SummaryField label="Estimasi Durasi" value={leadDurationMonths ? `${leadDurationMonths} bulan` : "-"} />
              <input type="hidden" name="estimated_duration_months" value={leadDurationMonths?.toString() ?? ""} />
            </>
          ) : (
            <>
              <Field label="Positions" name="position_name" defaultValue={tracker.position_name ?? ""} suggestions={positionSuggestions} />
              <SelectField label="Level" name="level_code" defaultValue={tracker.level_code ?? ""} options={LEVELS} />
              <Field label="Headcount" name="headcount_target" type="number" defaultValue={tracker.headcount_target?.toString() ?? ""} />
              <Field label={t("fields.price")} name="price_amount" money defaultValue={tracker.price_amount?.toString() ?? ""} />
              <SelectField label={t("fields.pricePeriod")} name="price_period_code" defaultValue={tracker.price_period_code ?? "monthly"} options={PRICE_PERIODS} />
              <Field label="Estimasi Durasi (bulan)" name="estimated_duration_months" type="number" defaultValue={tracker.estimated_duration_months?.toString() ?? ""} />
            </>
          )}
          <Field label="Closing Price Deal" name="estimated_deal_amount" money defaultValue={tracker.estimated_deal_amount?.toString() ?? ""} />
          <SelectField label="BANTE Score" name="bante_score" defaultValue={tracker.bante_score?.toString() ?? ""} options={BANTE_SCORES} />

          <Field label="Last Communication" name="last_communication_date" type="date" defaultValue={tracker.last_communication_date ?? ""} />
          <SelectField label="Opty Status" name="opty_status_code" defaultValue={tracker.opty_status_code} options={OPTY_STATUS_OPTIONS} />
          <label className="flex items-center gap-2 pt-6">
            <input type="checkbox" name="sales_qualified" value="true" defaultChecked={tracker.sales_qualified} className="rounded border-slate-300" />
            <span className="text-sm font-medium text-slate-700">Sales Qualified</span>
          </label>

          <div className="sm:col-span-3">
            {fromLead ? (
              <>
                <SummaryField label="Nama Project" value={leadProjectName || "-"} multiline />
                <input type="hidden" name="requirement_summary" value={leadProjectName} />
              </>
            ) : (
              <Field label="Nama Project" name="requirement_summary" defaultValue={tracker.requirement_summary ?? ""} textarea />
            )}
          </div>
          <div className="sm:col-span-3">
            {fromLead ? (
              <>
                <SummaryField label="Detail Requirement" value={leadNotes || "-"} multiline />
                <input type="hidden" name="detail_requirement" value={leadNotes} />
              </>
            ) : (
              <Field label="Detail Requirement" name="detail_requirement" defaultValue={tracker.detail_requirement ?? ""} textarea />
            )}
          </div>
          <div className="sm:col-span-3">
            <Field label="Progress Notes" name="progress_notes" defaultValue={tracker.progress_notes ?? ""} textarea />
          </div>
          <div className="sm:col-span-3">
            <Field label="Dropped Reason" name="dropped_reason" defaultValue={tracker.dropped_reason ?? ""} textarea />
          </div>

          <div className="sm:col-span-3 flex gap-3 pt-2">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/sales/opportunity-tracker" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

/** Tampilan read-only buat field yang sumber kebenarannya ada di Lead terkait
 *  (bukan salinan tracker sendiri) -- pola sama dengan SummaryField di
 *  src/app/tm/[id]/edit/page.tsx, direplikasi lokal di sini. */
function SummaryField({ label, value, multiline }: { label: string; value: string | number; multiline?: boolean }) {
  return (
    <div className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <p className={`w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value}
      </p>
    </div>
  );
}
