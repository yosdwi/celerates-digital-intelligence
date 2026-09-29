import { db } from "@/db";
import { featureRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { updateFeatureRequest, deleteFeatureRequestAttachment } from "../../actions";
import { getAttachmentsWithUrls } from "@/lib/attachments";
import { FEATURE_REQUEST_ATTACHMENT_SOURCE, MODULE_AREAS, REQUEST_TYPES, PRIORITIES } from "../../constants";
import { MultiFileUpload } from "@/components/multi-file-upload";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";

export default async function EditFeatureRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("featureRequests");
  const tc = await getTranslations("common");
  const [request] = await db.select().from(featureRequests).where(eq(featureRequests.id, id));
  if (!request) notFound();

  const attachments = await getAttachmentsWithUrls(FEATURE_REQUEST_ATTACHMENT_SOURCE, id);
  const updateWithId = updateFeatureRequest.bind(null, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-pink-500" eyebrow="Development" title={t("editTitle", { requestNo: request.request_no })}>
        <Link href="/feature-requests" className="text-sm font-medium text-pink-700 hover:underline">&larr; {t("backToList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-4xl mx-auto">
        <form action={updateWithId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="sm:col-span-3">
            <Field label={t("fieldTitle")} name="title" defaultValue={request.title} required />
          </div>

          <SelectField label={t("fieldModuleArea")} name="module_area_code" defaultValue={request.module_area_code ?? ""} options={MODULE_AREAS} />
          <SelectField label={t("fieldRequestType")} name="request_type_code" defaultValue={request.request_type_code} options={REQUEST_TYPES} />
          <SelectField label="Priority" name="priority_code" defaultValue={request.priority_code} options={PRIORITIES} />

          <div className="sm:col-span-3">
            <Field label={t("fieldDescription")} name="description" defaultValue={request.description} textarea required rows={4} />
          </div>

          <div className="sm:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("fieldCurrentBehaviorEdit")} name="current_behavior" defaultValue={request.current_behavior ?? ""} textarea />
            <Field label={t("fieldExpectedBehavior")} name="expected_behavior" defaultValue={request.expected_behavior ?? ""} textarea />
          </div>

          <div className="sm:col-span-2">
            <Field label={t("fieldBusinessImpactEdit")} name="business_impact" defaultValue={request.business_impact ?? ""} textarea />
          </div>
          <Field label={t("fieldTargetDateEdit")} name="target_date" type="date" defaultValue={request.target_date ?? ""} />

          <div className="sm:col-span-3">
            <MultiFileUpload
              name="attachments"
              label={t("fieldAttachmentsEdit")}
              existingFiles={attachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
              onDeleteExisting={deleteFeatureRequestAttachment}
            />
          </div>

          <div className="sm:col-span-3 flex gap-3 pt-2 border-t border-slate-100">
            <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
              {t("saveChanges")}
            </button>
            <Link href="/feature-requests" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {tc("cancel")}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
