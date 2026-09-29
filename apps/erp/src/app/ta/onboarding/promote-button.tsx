"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { promoteToEmployee } from "./actions";

export function PromoteButton({ onboardingRequestId }: { onboardingRequestId: string }) {
  const t = useTranslations("ta.onboarding.promoteButton");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 w-full">
        {t("promoteToEmployee")}
      </button>
    );
  }

  function handleConfirm() {
    startTransition(async () => {
      setError(null);
      const result = await promoteToEmployee(onboardingRequestId);
      if (!result.ok) { setError(result.error); return; }
      setOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[180px] bg-purple-50 p-2 rounded-lg border border-purple-100">
      <p className="text-xs text-slate-600">{t("confirmQuestion")}</p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className="rounded bg-purple-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {isPending ? "..." : t("yesPromote")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="rounded px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          {t("cancel")}
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
