"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { notifyTalentOnboarded } from "./pq-tracker-actions";

export function ConvertToPqTrackerButton({
  onboardingRequestId,
  alreadyConverted,
}: {
  onboardingRequestId: string;
  alreadyConverted?: boolean;
}) {
  const t = useTranslations("ta.onboarding.convertPqButton");
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(alreadyConverted ?? false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(t("confirm"))) return;
    startTransition(async () => {
      setError(null);
      try {
        await notifyTalentOnboarded(onboardingRequestId);
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("failed"));
      }
    });
  }

  if (done) return <span className="text-xs text-green-600 block">✓ {t("alreadyNotified")}</span>;

  return (
    <div>
      <button onClick={handleClick} disabled={isPending} className="text-xs font-medium text-pink-600 hover:underline block disabled:opacity-50">
        {isPending ? t("sending") : t("convertToPqTracker")}
      </button>
      {error && <p className="text-[10px] text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}