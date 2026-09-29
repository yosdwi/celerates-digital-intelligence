import { safeContextPath } from "@/lib/access-policy";
import { db } from "@/db";
import { featureRequests } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { createFeatureRequest } from "./actions";
import { getAttachmentsWithUrlsForMany } from "@/lib/attachments";
import { FEATURE_REQUEST_ATTACHMENT_SOURCE, MODULE_AREAS, REQUEST_TYPES, PRIORITIES } from "./constants";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ExpandableSection } from "@/components/expandable-section";
import { AddRecordModal } from "@/components/add-record-modal";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { FeatureRequestsTable } from "./feature-requests-table";
import { Lightbulb } from "lucide-react";
import { Field, SelectField } from "@/components/form-fields";

export default async function FeatureRequestsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const contextPath = safeContextPath((await searchParams).from);
  const t = await getTranslations("featureRequests");
  const session = await getServerSession(authOptions);
  const isOwner = Boolean((session?.user as any)?.isOwner);
  const currentUserId = (session?.user as any)?.id as string | undefined;

  const rows = await db.select().from(featureRequests).orderBy(desc(featureRequests.created_at));

  const attachmentsByRow = await getAttachmentsWithUrlsForMany(FEATURE_REQUEST_ATTACHMENT_SOURCE, rows.map((r) => r.id));
  const rowsWithAttachments = rows.map((r) => ({ ...r, attachments: attachmentsByRow[r.id] }));

  const totalNew = rows.filter((r) => r.status_code === "new" || r.status_code === "pending").length;
  const totalInProgress = rows.filter((r) => r.status_code === "on_develop" || r.status_code === "testing").length;
  const totalDone = rows.filter((r) => r.status_code === "done").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Lightbulb}
        color="bg-pink-500"
        eyebrow="Development"
        title="Feature Request"
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Request" value={rows.length} color="navy" />
          <StatCard label="New" value={totalNew} color="amber" />
          <StatCard label={t("statInProgress")} value={totalInProgress} color="blue" />
          <StatCard label="Done" value={totalDone} color="green" />
        </div>

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("createRequest")} title={t("createRequestModalTitle")} action={createFeatureRequest}>
            <input type="hidden" name="context_path" value={contextPath} />
            <p className="sm:col-span-3 text-sm text-slate-500">Konteks: {contextPath}. Hindari memasukkan data pribadi atau kredensial.</p>
            <div className="sm:col-span-3">
              <Field label={t("fieldTitle")} name="title" required />
            </div>

            <SelectField label={t("fieldModuleArea")} name="module_area_code" options={MODULE_AREAS} />
            <SelectField label={t("fieldRequestType")} name="request_type_code" options={REQUEST_TYPES} />
            <SelectField label="Priority" name="priority_code" options={PRIORITIES} defaultValue="medium" />

            <div className="sm:col-span-3">
              <Field label={t("fieldDescription")} name="description" textarea required rows={4} />
            </div>

            <div className="sm:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("fieldCurrentBehavior")} name="current_behavior" textarea />
              <Field label={t("fieldExpectedBehavior")} name="expected_behavior" textarea />
            </div>

            <div className="sm:col-span-2">
              <Field label={t("fieldBusinessImpact")} name="business_impact" textarea />
            </div>
            <Field label={t("fieldTargetDate")} name="target_date" type="date" />

            <div className="sm:col-span-3">
              <MultiFileUpload name="attachments" label={t("fieldAttachments")} />
            </div>
          </AddRecordModal>
        </div>

        <ExpandableSection title={t("listTitle", { count: rows.length })}>
          <FeatureRequestsTable data={rowsWithAttachments} isOwner={isOwner} currentUserId={currentUserId} />
        </ExpandableSection>
      </main>
    </div>
  );
}
