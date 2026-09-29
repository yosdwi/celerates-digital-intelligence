"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { convertLeadToOpportunity } from "./actions";

export function ConvertButton({ leadId }: { leadId: string }) {
  const t = useTranslations("marketing");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100"
      >
        {t("convertToOpportunity")}
      </button>
    );
  }

  function handleConfirm() {
    startTransition(async () => {
      setError(null);
      const result = await convertLeadToOpportunity(leadId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[180px]">
      <p className="text-xs text-slate-600">{t("convertConfirm")}</p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className="rounded bg-brand-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {isPending ? "..." : t("yesConvert")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="rounded px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          {tc("cancel")}
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}