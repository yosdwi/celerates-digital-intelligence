"use client";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, RotateCcw, Clock } from "lucide-react";
import { upsertFinanceHandoff } from "../actions";

export function FinanceHandoffPanel({
  opportunityId,
  invoiceId,
  docUrl,
  statusCode,
  notifiedByName,
  notifiedAt,
  receivedByName,
  receivedAt,
  financeNotes,
}: {
  opportunityId: string;
  invoiceId: string;
  docUrl: string | null;
  statusCode: string;
  notifiedByName: string | null;
  notifiedAt: string | null;
  receivedByName?: string | null;
  receivedAt?: string | null;
  financeNotes?: string | null;
}) {
  const t = useTranslations("pmo.invoices");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const upsertWithId = upsertFinanceHandoff.bind(null, opportunityId, invoiceId);

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        {statusCode === "received" ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("financeReceived")}{receivedByName ? ` · ${receivedByName}` : ""}
          </span>
        ) : statusCode === "needs_revision" ? (
          <div className="max-w-[200px]">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
              <RotateCcw className="h-3.5 w-3.5" /> {t("financeReturned")}
            </span>
            {financeNotes && <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{financeNotes}</p>}
          </div>
        ) : statusCode === "notified" ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
            <Clock className="h-3.5 w-3.5" /> {t("financeWaiting")}{notifiedByName ? ` · ${notifiedByName}` : ""}
          </span>
        ) : (
          <span className="text-xs font-medium text-slate-400">{t("financeNotSubmitted")}</span>
        )}
        <button onClick={() => setOpen(true)} className="text-xs font-medium text-brand-600 hover:underline text-left">
          {t("manageFinanceDoc")}
        </button>
      </div>
    );
  }

  function submit(notify: boolean) {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("notify", notify ? "true" : "false");
    startTransition(async () => {
      setError(null);
      const result = await upsertWithId(fd);
      if (!result.ok) { setError(result.error); return; }
      setOpen(false);
    });
  }

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(false); }} className="flex flex-col gap-1.5 min-w-[220px] bg-slate-50 p-2 rounded-lg border border-slate-200">
      <input
        name="doc_url"
        defaultValue={docUrl ?? ""}
        placeholder={t("financeDocUrlPlaceholder")}
        className="rounded border border-slate-300 px-2 py-1 text-xs"
      />
      <input name="notes" placeholder={t("notesOptionalPlaceholder")} className="rounded border border-slate-300 px-2 py-1 text-xs" />
      {notifiedAt && <span className="text-[10px] text-slate-400">{t("lastNotified")}: {notifiedAt} {t("by")} {notifiedByName ?? "-"}</span>}
      <div className="flex gap-1.5">
        <button type="submit" disabled={isPending} className="rounded bg-slate-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
          {isPending ? "..." : t("saveLink")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => submit(true)}
          className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {t("notifyFinance")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
          {tc("cancel")}
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
