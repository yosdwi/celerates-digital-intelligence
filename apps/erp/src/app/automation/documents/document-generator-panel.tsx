"use client";
import { useState, useTransition } from "react";
import { Download, Trash2, FileCog, Eye, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast-provider";
import { generateDocument, deleteTemplate, previewDocument } from "./actions";
import { DOCUMENT_TYPES } from "../constants";
import type { PreviewResult } from "@/lib/automation/document-merge";

type Template = { id: string; type: string; name: string; created_at: Date | string };
type OnboardingRow = { id: string; candidateName: string | null; startDate: string | null };

export function DocumentGeneratorPanel({ templates, onboardingRows }: { templates: Template[]; onboardingRows: OnboardingRow[] }) {
  const t = useTranslations("automation");
  const documentTypeLabels: Record<string, string> = Object.fromEntries(
    DOCUMENT_TYPES.map(([value]) => [value, t(`documentType.${value}`)])
  );
  const [templateId, setTemplateId] = useState("");
  const [onboardingId, setOnboardingId] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  function resetOutputs() {
    setDownloadUrl(null);
    setPreview(null);
  }

  function handlePreview() {
    if (!templateId || !onboardingId) {
      showToast(t("documents.selectTemplateAndOnboarding"), "error");
      return;
    }
    resetOutputs();
    startTransition(async () => {
      const res = await previewDocument(templateId, onboardingId);
      if (res.ok) {
        setPreview(res.preview);
        if (res.preview.unknownTags.length > 0) {
          showToast(t("documents.unknownTagsToast", { count: res.preview.unknownTags.length }), "error");
        } else {
          showToast(t("documents.previewReady"));
        }
      } else {
        showToast(res.error, "error");
      }
    });
  }

  function handleGenerate() {
    if (!templateId || !onboardingId) {
      showToast(t("documents.selectTemplateAndOnboarding"), "error");
      return;
    }
    setDownloadUrl(null);
    startTransition(async () => {
      const res = await generateDocument(templateId, onboardingId);
      if (res.ok) {
        setDownloadUrl(res.signedUrl);
        showToast(t("documents.generateSuccess"));
      } else {
        showToast(res.error, "error");
      }
    });
  }

  function handleDeleteTemplate(id: string) {
    if (!confirm(t("documents.confirmDeleteTemplate"))) return;
    startTransition(async () => {
      try {
        await deleteTemplate(id);
        showToast(t("documents.templateDeleted"));
      } catch (e: any) {
        showToast(e.message ?? t("deleteFailed"), "error");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("documents.savedTemplates")}</h3>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-400">{t("documents.noTemplatesUploaded")}</p>
          ) : (
            <ul className="space-y-2">
              {templates.map((tpl) => (
                <li key={tpl.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{tpl.name}</p>
                    <p className="text-xs text-slate-400">{documentTypeLabels[tpl.type]}</p>
                  </div>
                  <button onClick={() => handleDeleteTemplate(tpl.id)} className="text-slate-400 hover:text-red-600 shrink-0" title={t("deleteTitle")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><FileCog className="h-4 w-4" /> {t("documents.generateDocument")}</h3>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t("documents.templateLabel")}</span>
              <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); resetOutputs(); }} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">{t("documents.selectTemplateOption")}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name} ({documentTypeLabels[tpl.type]})</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t("documents.onboardingRecordLabel")}</span>
              <select value={onboardingId} onChange={(e) => { setOnboardingId(e.target.value); resetOutputs(); }} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">{t("documents.selectTalentOption")}</option>
                {onboardingRows.map((o) => (
                  <option key={o.id} value={o.id}>{o.candidateName ?? t("documents.noName")} {o.startDate ? t("documents.startDateSuffix", { date: o.startDate }) : ""}</option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                disabled={isPending}
                onClick={handlePreview}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                <Eye className="h-4 w-4" /> {isPending ? t("documents.processing") : t("documents.preview")}
              </button>

              <button
                disabled={isPending}
                onClick={handleGenerate}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isPending ? t("documents.generating") : t("documents.generateAndDownload")}
              </button>

              {downloadUrl && (
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100"
                >
                  <Download className="h-4 w-4" /> {t("documents.downloadResult")}
                </a>
              )}
            </div>

            {preview && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
                  <p className="font-medium">{t("documents.autoFilledFields", { count: preview.autoFilledLabels.length })}</p>
                  <p className="mt-0.5">{preview.autoFilledLabels.length > 0 ? preview.autoFilledLabels.join(", ") : t("documents.noMatchingLabels")}</p>
                </div>
                {preview.unknownTags.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{t("documents.unknownTagsLabel")}</p>
                      <p className="mt-0.5 font-mono">{preview.unknownTags.map((tag) => `{${tag}}`).join(", ")}</p>
                    </div>
                  </div>
                )}
                <p className="text-xs text-slate-400">{t("documents.detectedTagsLabel")} {preview.foundTags.length > 0 ? preview.foundTags.map((tag) => `{${tag}}`).join(", ") : t("documents.noneParenthesized")}</p>
                {preview.remainingBlanks.length > 0 && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                    <p className="font-medium">{t("documents.remainingBlanksLabel", { count: preview.remainingBlanks.length })}</p>
                    <ul className="mt-1 space-y-1 font-mono">
                      {preview.remainingBlanks.map((line, i) => <li key={i} className="break-words">{line}</li>)}
                    </ul>
                    <p className="mt-1.5 text-red-600">{t("documents.remainingBlanksHint")}</p>
                  </div>
                )}
                {preview.tableDebug.length > 0 && (
                  <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                    <summary className="cursor-pointer font-medium">{t("documents.tableDebugSummary", { count: preview.tableDebug.length })}</summary>
                    <ul className="mt-2 space-y-1 font-mono">
                      {preview.tableDebug.map((row, i) => <li key={i} className="break-words">[{row.cells.map((c) => `"${c}"`).join(", ")}]</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-6">
          <p className="text-xs font-medium text-slate-500 mb-3">{t("documents.previewDocumentHint")}</p>
          <div className="mx-auto max-w-3xl max-h-[70vh] overflow-y-auto rounded-sm bg-white shadow-md">
            <div className="docx-preview px-12 py-10" dangerouslySetInnerHTML={{ __html: preview.previewHtml }} />
          </div>
          <style>{`
            .docx-preview { font-family: "Times New Roman", Georgia, serif; font-size: 14px; line-height: 1.6; color: #1e293b; }
            .docx-preview p { margin: 0 0 8px; }
            .docx-preview table { border-collapse: collapse; width: 100%; margin: 8px 0; }
            .docx-preview table td, .docx-preview table th { border: 1px solid #94a3b8; padding: 6px 8px; vertical-align: top; }
            .docx-preview strong { font-weight: 700; }
            .docx-preview h1, .docx-preview h2, .docx-preview h3 { font-weight: 700; margin: 12px 0 8px; }
            .docx-preview img { max-width: 100%; }
          `}</style>
        </div>
      )}
    </div>
  );
}
