"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateClientSubmissionStatus } from "./actions";
import { CLIENT_SUBMISSION_STATUSES, CLIENT_SUBMISSION_LABELS, CLIENT_SUBMISSION_STYLES } from "./constants";

export type ClientSubmissionInfo = {
  statusCode: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  note: string | null;
};

export function ClientSubmissionStatus({
  applicationId,
  info,
}: {
  applicationId: string;
  info: ClientSubmissionInfo;
}) {
  const t = useTranslations("ta.clientActive.submissionStatus");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await updateClientSubmissionStatus(applicationId, fd);
      if (!result.ok) { setError(result.error); return; }
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1 items-start">
        {info.statusCode ? (
          <span className={`inline-flex items-center rounded-full whitespace-nowrap px-2.5 py-0.5 text-xs font-medium ${CLIENT_SUBMISSION_STYLES[info.statusCode] ?? "bg-slate-100 text-slate-600"}`}>
            {CLIENT_SUBMISSION_LABELS[info.statusCode] ?? info.statusCode}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full whitespace-nowrap px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-400">
            {t("notSentToClient")}
          </span>
        )}
        {info.updatedByName && (
          <span className="text-[10px] text-slate-400">
            {info.updatedByName} &middot; {info.updatedAt ? new Date(info.updatedAt).toLocaleDateString("id-ID") : ""}
          </span>
        )}
        {info.note && <span className="text-[10px] text-slate-500 italic max-w-[180px] truncate" title={info.note}>{info.note}</span>}
        <button onClick={() => setOpen(true)} className="text-[11px] font-medium text-teal-600 hover:underline">
          Update Status
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 min-w-[200px] bg-teal-50 p-2 rounded-lg border border-teal-200">
      <select name="client_submission_status_code" defaultValue={info.statusCode ?? ""} required className="rounded border border-slate-300 px-2 py-1 text-xs">
        <option value="">{t("selectStatusPlaceholder")}</option>
        {CLIENT_SUBMISSION_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <textarea name="client_submission_note" defaultValue={info.note ?? ""} placeholder={t("notePlaceholder")} rows={2} className="rounded border border-slate-300 px-2 py-1 text-xs" />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex gap-1.5">
        <button type="submit" disabled={isPending} className="rounded bg-teal-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
          {isPending ? tc("saving") : tc("save")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}
