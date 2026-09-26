"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { processExtensionRequest } from "./actions";

export function ProcessButton({ requestId }: { requestId: string }) {
  const t = useTranslations("hr.extensionRequests.processButton");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(t("confirmProcess"))) return;
    startTransition(async () => {
      setError(null);
      const result = await processExtensionRequest(requestId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
      >
        {isPending ? t("processing") : t("processToAddendum")}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
