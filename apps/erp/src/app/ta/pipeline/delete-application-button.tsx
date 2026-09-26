"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteApplication } from "./actions";

export function DeleteApplicationButton({ applicationId }: { applicationId: string }) {
  const t = useTranslations("ta.pipeline.deleteButton");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(t("confirmDelete"))) return;
    startTransition(async () => {
      setError(null);
      const result = await deleteApplication(applicationId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="leading-none">
      <button onClick={handleClick} disabled={isPending} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
        {isPending ? t("deleting") : tc("delete")}
      </button>
      {error && <p className="text-xs text-red-600 mt-1 max-w-[150px]">{error}</p>}
    </div>
  );
}