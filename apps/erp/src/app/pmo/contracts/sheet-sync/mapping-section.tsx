"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ColumnMappingForm, TargetField } from "@/components/column-mapping-form";
import { fetchSheetHeaders, saveColumnMapping } from "./actions";

export function MappingSection({ targetFields, savedMapping }: { targetFields: TargetField[]; savedMapping: Record<string, string> }) {
  const t = useTranslations("pmo.contracts.sheetSync");
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLoadHeaders() {
    startTransition(async () => {
      setError(null);
      const result = await fetchSheetHeaders();
      if (result.ok) setHeaders(result.headers);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {!headers && (
        <button onClick={handleLoadHeaders} disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {isPending ? t("readingSheet") : t("readColumnsFromSheet")}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {headers && (
        <ColumnMappingForm headers={headers} targetFields={targetFields} currentMapping={savedMapping} onSave={saveColumnMapping} />
      )}
    </div>
  );
}