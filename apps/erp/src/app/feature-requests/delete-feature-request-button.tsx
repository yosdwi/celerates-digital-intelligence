"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteFeatureRequest } from "./actions";

export function DeleteFeatureRequestButton({ requestId }: { requestId: string }) {
  const t = useTranslations("featureRequests");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      setError(null);
      const result = await deleteFeatureRequest(requestId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="leading-none">
      <button onClick={handleClick} disabled={isPending} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
        {isPending ? t("deletingButton") : tc("delete")}
      </button>
      {error && <p className="text-xs text-red-600 mt-1 max-w-[150px]">{error}</p>}
    </div>
  );
}
