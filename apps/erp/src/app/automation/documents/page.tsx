import { db } from "@/db";
import { automationDocumentTemplates, automationGeneratedDocuments, onboardingRequests, candidates, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field, SelectField } from "@/components/form-fields";
import { Bot } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createTemplate } from "./actions";
import { DOCUMENT_TYPES } from "../constants";
import { DOCUMENT_PLACEHOLDERS } from "@/lib/automation/placeholders";
import { DocumentGeneratorPanel } from "./document-generator-panel";
import { GeneratedDocumentsHistory } from "./generated-documents-history";
import { getSignedUrl } from "@/lib/automation/storage";

export default async function DocumentsPage() {
  const t = await getTranslations("automation");
  const documentTypeOptions = DOCUMENT_TYPES.map(([value]) => [value, t(`documentType.${value}`)] as const);
  const templates = await db.select().from(automationDocumentTemplates).orderBy(desc(automationDocumentTemplates.created_at));

  const onboardingRows = await db
    .select({
      id: onboardingRequests.id,
      candidateName: candidates.candidate_name,
      startDate: onboardingRequests.start_date,
    })
    .from(onboardingRequests)
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .orderBy(desc(onboardingRequests.created_at));

  const generatedRows = await db
    .select({
      id: automationGeneratedDocuments.id,
      storagePath: automationGeneratedDocuments.storage_path,
      generatedAt: automationGeneratedDocuments.generated_at,
      templateName: automationDocumentTemplates.name,
      templateType: automationDocumentTemplates.type,
      candidateName: candidates.candidate_name,
      generatedByName: users.full_name,
    })
    .from(automationGeneratedDocuments)
    .leftJoin(automationDocumentTemplates, eq(automationGeneratedDocuments.template_id, automationDocumentTemplates.id))
    .leftJoin(onboardingRequests, eq(automationGeneratedDocuments.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .leftJoin(users, eq(automationGeneratedDocuments.generated_by_user_id, users.id))
    .orderBy(desc(automationGeneratedDocuments.generated_at));

  const generatedHistory = await Promise.all(
    generatedRows.map(async (r) => ({ ...r, downloadUrl: await getSignedUrl(r.storagePath) }))
  );

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Bot}
        color="bg-indigo-600"
        eyebrow={t("eyebrow")}
        title="Document Generator"
        subtitle={t("documents.subtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard label={t("documents.statTotalTemplate")} value={templates.length} color="navy" />
          <StatCard label={t("documents.statContractTemplate")} value={templates.filter((t) => t.type === "contract").length} color="blue" />
          <StatCard label={t("documents.statOfferingTemplate")} value={templates.filter((t) => t.type === "offering").length} color="purple" />
          <StatCard label={t("documents.statOnboardingAvailable")} value={onboardingRows.length} color="amber" />
          <StatCard label={t("documents.statTotalGenerated")} value={generatedHistory.length} color="green" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-700">{t("documents.supportedPlaceholders")}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{t("documents.placeholderHint")} {"{nama}"}, {"{jabatan}"}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DOCUMENT_PLACEHOLDERS.map((p) => (
              <code key={p.tag} title={p.label} className="text-xs bg-slate-100 text-slate-700 rounded px-2 py-1">{`{${p.tag}}`}</code>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("documents.uploadNewTemplate")} title={t("documents.uploadTemplateModalTitle")} action={createTemplate}>
            <SelectField label={t("documents.documentTypeLabel")} name="type" options={documentTypeOptions} required />
            <div className="sm:col-span-2">
              <Field label={t("documents.templateNameLabel")} name="name" placeholder={t("documents.templateNamePlaceholder")} required />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("documents.templateFileLabel")}</label>
              <input name="file" type="file" accept=".docx" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </AddRecordModal>
        </div>

        <DocumentGeneratorPanel templates={templates} onboardingRows={onboardingRows} />

        <GeneratedDocumentsHistory rows={generatedHistory} />
      </main>
    </div>
  );
}
