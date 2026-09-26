import { db } from "@/db";
import { leads } from "@/db/schema";
import { getPicNames } from "@/lib/reference-data";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { updateLead } from "../../actions";
import { PicSelect } from "@/components/pic-select";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Pencil } from "lucide-react";

const SERVICE_TYPES = [
  ["outsourcing", "Outsourcing"], ["headhunting", "Headhunting"], ["outplacement", "Outplacement"],
  ["managed_service", "Managed Service"], ["project_based", "Project Based"], ["rpo", "RPO"],
  ["training", "Training"], ["license", "License"], ["hardware", "Hardware"],
  ["corporate_training", "Corporate Training"], ["software_development", "Software Development"],
] as const;
const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("marketing");
  const tc = await getTranslations("common");
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) notFound();

  const picNames = await getPicNames();

  const updateLeadWithId = updateLead.bind(null, id);

  const PRICE_PERIODS = [
    ["monthly", t("perMonth")], ["project", "Per Project"], ["yearly", t("perYear")], ["daily", t("perDay")],
  ] as const;

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-brand-500" eyebrow="Marketing" title={t("editLeadTitle", { leadNo: lead.lead_no })}>
        <Link href="/marketing" className="text-sm font-medium text-brand-700 hover:underline">&larr; {t("backToLeadsList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-3xl mx-auto">
        <form action={updateLeadWithId} className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label={t("clientName")} name="client_name" defaultValue={lead.client_name} required />
          <Field label={t("contactName")} name="contact_name" defaultValue={lead.contact_name} required />
          <Field label="Email" name="contact_email" type="email" defaultValue={lead.contact_email ?? ""} />
          <Field label="Phone" name="contact_phone" digitsOnly defaultValue={lead.contact_phone ?? ""} />
          <Field label="Company Size" name="company_size" type="number" defaultValue={lead.company_size?.toString() ?? ""} />
          <Field label="Industry" name="industry_code" defaultValue={lead.industry_code ?? ""} />

          <SelectField label="Service Type" name="service_type_code" defaultValue={lead.service_type_code} options={SERVICE_TYPES} required />
          <SelectField label={t("leadSource")} name="lead_source_code" defaultValue={lead.lead_source_code} required
            options={[["linkedin", "LinkedIn"], ["ads", "Ads"], ["referral", "Referral"], ["existing", "Existing"], ["website", "Website"]]} />
          <SelectField label={t("category")} name="category_code" defaultValue={lead.category_code} required
            options={[["it", "IT"], ["non_it", "Non-IT"]]} />
          <PicSelect name="sales_pic_name" label="Sales PIC" defaultValue={lead.sales_pic_name} options={picNames} required currentPath={`/marketing/${id}/edit`} />

          <Field label={t("projectName")} name="project_name" defaultValue={lead.project_name ?? ""} required hint={t("projectNameHint")} />
          <Field label={t("price")} name="price_amount" money defaultValue={lead.price_amount?.toString() ?? ""} />
          <SelectField label={t("pricePeriod")} name="price_period_code" defaultValue={lead.price_period_code ?? "monthly"} options={PRICE_PERIODS} />

          <Field label={t("positionName")} name="position_name" defaultValue={lead.position_name ?? ""} />
          <Field label="Headcount Target" name="headcount_target" type="number" defaultValue={lead.headcount_target?.toString() ?? ""} />
          <SelectField label="Level" name="level_code" defaultValue={lead.level_code ?? ""} options={LEVELS} />
          <Field label={t("estimatedDuration")} name="estimated_duration_months" type="number" defaultValue={lead.estimated_duration_months?.toString() ?? ""} />

          <div className="sm:col-span-2">
            <Field label={t("notes")} name="notes" defaultValue={lead.notes ?? ""} textarea />
          </div>

          <SelectField label={t("qualificationStatus")} name="is_qualified"
            defaultValue={lead.is_qualified === null ? "" : String(lead.is_qualified)}
            options={[["", t("notDecided")], ["true", "Qualified"], ["false", "Disqualified"]]} />
          <Field label={t("disqualifyReason")} name="disqualify_reason" defaultValue={lead.disqualify_reason ?? ""} />

          <div className="sm:col-span-2 flex gap-3 pt-2">
            <SubmitButton label={t("saveChanges")} pendingLabel={tc("saving")} />
            <Link href="/marketing" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {tc("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
