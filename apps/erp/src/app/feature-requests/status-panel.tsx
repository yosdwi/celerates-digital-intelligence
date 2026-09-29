"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateFeatureRequestStatus } from "./actions";
import { STATUSES, STATUS_LABELS, STATUS_STYLES } from "./constants";

export function StatusPanel({
  requestId,
  statusCode,
  assignedToName,
  resolutionNotes,
  isOwner,
  review,
}: {
  requestId: string;
  statusCode: string;
  assignedToName: string | null;
  resolutionNotes: string | null;
  isOwner: boolean;
  review?: { acceptance_criteria: string | null; backlog_url: string | null; delivered_release: string | null; validation_notes: string | null };
}) {
  const t = useTranslations("featureRequests");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await updateFeatureRequestStatus(requestId, fd);
      if (!result.ok) { setError(result.error); return; }
      setOpen(false);
    });
  }

  const badge = (
    <span className={`inline-flex items-center rounded-full whitespace-nowrap px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[statusCode] ?? "bg-slate-100 text-slate-600"}`}>
      {STATUS_LABELS[statusCode] ?? statusCode}
    </span>
  );

  if (!isOwner) {
    return (
      <div className="flex flex-col gap-1 items-start">
        {badge}
        {assignedToName && <span className="text-[11px] text-slate-400">{t("picLabel", { name: assignedToName })}</span>}
        {resolutionNotes && <span className="text-[11px] text-slate-500 italic max-w-[180px]" title={resolutionNotes}>{resolutionNotes}</span>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1 items-start">
        {badge}
        {assignedToName && <span className="text-[11px] text-slate-400">{t("picLabel", { name: assignedToName })}</span>}
        {resolutionNotes && <span className="text-[11px] text-slate-500 italic max-w-[180px]" title={resolutionNotes}>{resolutionNotes}</span>}
        <button onClick={() => setOpen(true)} className="text-[11px] font-medium text-pink-600 hover:underline">
          {t("updateStatus")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 min-w-[200px] bg-pink-50 p-2 rounded-lg border border-pink-200">
      <select name="status_code" defaultValue={statusCode} required className="rounded border border-slate-300 px-2 py-1 text-xs">
        {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input name="assigned_to_name" defaultValue={assignedToName ?? ""} placeholder={t("assignedToPlaceholder")} className="rounded border border-slate-300 px-2 py-1 text-xs" />
      <textarea name="resolution_notes" defaultValue={resolutionNotes ?? ""} placeholder={t("resolutionNotesPlaceholder")} rows={2} className="rounded border border-slate-300 px-2 py-1 text-xs" />
      <label className="text-xs">Acceptance criteria (BA)<textarea name="acceptance_criteria" defaultValue={review?.acceptance_criteria ?? ""} className="border rounded p-1 w-full" /></label>
      <label className="text-xs">Link backlog / issue<input name="backlog_url" defaultValue={review?.backlog_url ?? ""} className="border rounded p-1 w-full" /></label>
      <label className="text-xs">Rilis yang divalidasi<input name="delivered_release" defaultValue={review?.delivered_release ?? ""} className="border rounded p-1 w-full" /></label>
      <label className="text-xs">Bukti / catatan validasi<textarea name="validation_notes" defaultValue={review?.validation_notes ?? ""} className="border rounded p-1 w-full" /></label>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex gap-1.5">
        <button type="submit" disabled={isPending} className="rounded bg-pink-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
          {isPending ? tc("saving") : tc("save")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}
