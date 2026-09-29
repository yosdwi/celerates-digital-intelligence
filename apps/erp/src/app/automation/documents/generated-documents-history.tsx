"use client";
import { useTransition } from "react";
import { Download, Trash2, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast-provider";
import { deleteGeneratedDocument } from "./actions";
import { DOCUMENT_TYPES } from "../constants";

type HistoryRow = {
  id: string;
  storagePath: string;
  generatedAt: Date | string;
  templateName: string | null;
  templateType: string | null;
  candidateName: string | null;
  generatedByName: string | null;
  downloadUrl: string | null;
};

export function GeneratedDocumentsHistory({ rows }: { rows: HistoryRow[] }) {
  const t = useTranslations("automation");
  const documentTypeLabels: Record<string, string> = Object.fromEntries(
    DOCUMENT_TYPES.map(([value]) => [value, t(`documentType.${value}`)])
  );
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  function handleDelete(id: string) {
    if (!confirm(t("documents.confirmDeleteHistory"))) return;
    startTransition(async () => {
      try {
        await deleteGeneratedDocument(id);
        showToast(t("documents.historyDeleted"));
      } catch (e: any) {
        showToast(e.message ?? t("deleteFailed"), "error");
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <History className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-700">{t("documents.historyTitle", { count: rows.length })}</h3>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">{t("documents.noHistoryYet")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-brand-700 font-semibold border-b border-brand-200 bg-brand-50">
                <th className="px-6 py-2 font-medium">{t("documents.colTalent")}</th>
                <th className="px-4 py-2 font-medium">{t("documents.colType")}</th>
                <th className="px-4 py-2 font-medium">{t("documents.colTemplate")}</th>
                <th className="px-4 py-2 font-medium">{t("documents.colGeneratedBy")}</th>
                <th className="px-4 py-2 font-medium">{t("documents.colDate")}</th>
                <th className="px-4 py-2 font-medium text-right">{t("documents.colAction")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-6 py-3 font-medium text-slate-800">{row.candidateName ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.templateType ? documentTypeLabels[row.templateType] : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.templateName ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.generatedByName ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(row.generatedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {row.downloadUrl ? (
                        <a
                          href={row.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                        >
                          <Download className="h-3.5 w-3.5" /> {t("documents.download")}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">{t("documents.fileNotFound")}</span>
                      )}
                      <button
                        disabled={isPending}
                        onClick={() => handleDelete(row.id)}
                        title={t("documents.deleteHistoryTitle")}
                        className="rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
