import { db } from "@/db";
import { leads, salesOpportunityTrackers } from "@/db/schema";
import { getPicNames } from "@/lib/reference-data";
import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { createLead } from "./actions";
import { StatusBadge } from "./status-badge";
import { ConvertButton } from "./convert-button";
import { DeleteLeadButton } from "./delete-lead-button";
import Link from "next/link";
import { ExpandableSection } from "@/components/expandable-section";
import { PicSelect } from "@/components/pic-select";
import { TableControls } from "@/components/table-controls";
import { LeadsTable } from "./leads-table";
import { PasteRowParser } from "./paste-row-parser";
import { Megaphone, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field, SelectField as SelectFieldBase } from "@/components/form-fields";

function SelectField(props: React.ComponentProps<typeof SelectFieldBase>) {
  return <SelectFieldBase {...props} includeEmptyOption={false} />;
}

const SERVICE_TYPES = [
  ["outsourcing", "Outsourcing"], ["headhunting", "Headhunting"], ["outplacement", "Outplacement"],
  ["managed_service", "Managed Service"], ["project_based", "Project Based"], ["rpo", "RPO"],
  ["training", "Training"], ["license", "License"], ["hardware", "Hardware"],
  ["corporate_training", "Corporate Training"], ["software_development", "Software Development"],
] as const;

const CATEGORIES = [["it", "IT"], ["non_it", "Non-IT"]] as const;
const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;

export default async function HomePage() {
  const t = await getTranslations("marketing");
  const PRICE_PERIODS = [
    ["monthly", t("perMonth")], ["project", "Per Project"], ["yearly", t("perYear")], ["daily", t("perDay")],
  ] as const;
  const QUALIFICATION_STATUS = [
    ["null", t("notDecided")], ["true", "Qualified"], ["false", "Disqualified"],
  ] as const;
  const [data, picNames, converted] = await Promise.all([
    db.select().from(leads).orderBy(desc(leads.created_at)),
    getPicNames(),
    db.select({ lead_id: salesOpportunityTrackers.lead_id }).from(salesOpportunityTrackers),
  ]);

  const convertedLeadIds = new Set(converted.map((r) => r.lead_id).filter((id): id is string => id !== null));

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Megaphone}
        color="bg-brand-500"
        eyebrow="Marketing"
        title="Leads"
        subtitle={t("pageSubtitle")}
      >
        <Link
          href="/marketing/sheet-sync"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Google Sheet Sync
        </Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
    <StatCard label="Total Leads" value={data.length} color="navy" />
    <StatCard label="Qualified" value={data.filter((d) => d.is_qualified === true).length} color="green" />
    <StatCard label={t("notDecided")} value={data.filter((d) => d.is_qualified === null).length} color="amber" />
    <StatCard label="Disqualified" value={data.filter((d) => d.is_qualified === false).length} color="red" />
  </div>

  <div className="flex justify-end">
    <AddRecordModal buttonLabel={t("addNewLead")} title={t("addNewLeadTitle")} action={createLead}>
      <div className="sm:col-span-3">
        <ExpandableSection title={t("fillFromSheetTitle")}>
          <div className="p-4">
            <PasteRowParser />
          </div>
        </ExpandableSection>
      </div>

      <Field label={t("clientName")} name="client_name" required />
      <Field label={t("contactName")} name="contact_name" required />
      <Field label="Email" name="contact_email" type="email" />
      <Field label="Phone" name="contact_phone" digitsOnly />
      <Field label="Company Size" name="company_size" type="number" />
      <Field label="Industry" name="industry_code" />

      <SelectField label="Service Type" name="service_type_code" required options={SERVICE_TYPES} />
      <SelectField
        label={t("leadSource")} name="lead_source_code" required
        options={[["linkedin", "LinkedIn"], ["ads", "Ads"], ["referral", "Referral"], ["existing", "Existing"], ["website", "Website"]]}
      />
      <SelectField
        label={t("category")} name="category_code" required
        options={CATEGORIES}
      />
      <PicSelect name="sales_pic_name" label="Sales PIC" options={picNames} required currentPath="/marketing" />

      <Field label={t("projectName")} name="project_name" required hint={t("projectNameHint")} />
      <Field label={t("price")} name="price_amount" money />
      <SelectFieldBase label={t("pricePeriod")} name="price_period_code" defaultValue="monthly" options={PRICE_PERIODS} />

      <Field label={t("positionName")} name="position_name" />
      <Field label="Headcount Target" name="headcount_target" type="number" />
      <SelectFieldBase label="Level" name="level_code" options={LEVELS} />
      <Field label={t("estimatedDuration")} name="estimated_duration_months" type="number" />

      <div className="sm:col-span-3">
        <Field label={t("notes")} name="notes" textarea />
      </div>

      <SelectField
        label={t("qualificationStatus")} name="is_qualified"
        options={[["", t("notDecided")], ["true", "Qualified"], ["false", "Disqualified"]]}
      />
      <Field label={t("disqualifyReason")} name="disqualify_reason" hint={t("disqualifyReasonHint")} />
    </AddRecordModal>
  </div>

  <ExpandableSection title={t("leadsListTitle", { count: data.length })}>
    <LeadsTable data={data} convertedLeadIds={[...convertedLeadIds]} />
  </ExpandableSection>
</main>
            </div>
          );
        }
