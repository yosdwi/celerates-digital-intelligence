"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { approveTimesheetSubmission } from "./actions";
import { useToast } from "@/components/toast-provider";

export function ApproveSubmissionButton({ submissionId }: { submissionId: string }) {
  const t = useTranslations("timesheet");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  function handleClick() {
    if (!confirm(t("confirmApproveSubmission"))) return;
    startTransition(async () => {
      setError(null);
      const result = await approveTimesheetSubmission(submissionId);
      if (!result.ok) { setError(result.error); showToast(result.error, "error"); return; }
      showToast(t("submissionApprovedSuccess"));
    });
  }

  return (
    <div className="leading-none">
      <button onClick={handleClick} disabled={isPending} className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
        {isPending ? tc("saving") : t("approve")}
      </button>
      {error && <p className="text-xs text-red-600 mt-1 max-w-[150px]">{error}</p>}
    </div>
  );
}
