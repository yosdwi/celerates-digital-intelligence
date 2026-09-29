"use client";
import { useTransition } from "react";
import { updateOptyStatus, updateSalesQualified } from "./actions";

const OPTY_STATUS_OPTIONS = [
  ["cv_submission", "CV Submission"], ["solutioning", "Solutioning"],
  ["proposal_sent", "Proposal Sent"], ["win", "Win"], ["dropped", "Dropped"],
  ["need_action", "Need Action"],
] as const;

export function OptyStatusSelector({
  id,
  currentOptyStatus,
  currentSalesQualified,
}: {
  id: string;
  currentOptyStatus: string;
  currentSalesQualified: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <select
        defaultValue={currentOptyStatus}
        disabled={isPending}
        onChange={(e) => startTransition(() => updateOptyStatus(id, e.target.value))}
        className="w-full text-xs rounded border border-slate-300 px-1.5 py-1"
      >
        {OPTY_STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          defaultChecked={currentSalesQualified}
          disabled={isPending}
          onChange={(e) => startTransition(() => updateSalesQualified(id, e.target.checked))}
          className="rounded border-slate-300"
        />
        Sales Qualified
      </label>
    </div>
  );
}