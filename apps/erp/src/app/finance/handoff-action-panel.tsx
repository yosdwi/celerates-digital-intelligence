"use client";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2, RotateCcw, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { acknowledgeFinanceHandoff, requestRevisionFinanceHandoff } from "./actions";

export function HandoffActionPanel({
  opportunityId, statusCode, receivedByName, receivedAt, financeNotes, canVerify,
}: {
  opportunityId: string;
  statusCode: string;
  receivedByName: string | null;
  receivedAt: string | null;
  financeNotes: string | null;
  /** Cuma tim Finance (atau Owner) yang boleh verifikasi -- PMO cuma bisa lihat halaman ini (cross-division). */
  canVerify: boolean;
}) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<"idle" | "revision">("idle");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (statusCode === "received") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("received")}{receivedByName ? ` · ${receivedByName}` : ""}
        </span>
        {receivedAt && <span className="text-[10px] text-slate-400">{receivedAt}</span>}
      </div>
    );
  }

  if (statusCode === "needs_revision") {
    return (
      <div className="flex flex-col gap-0.5 max-w-[220px]">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
          <RotateCcw className="h-3.5 w-3.5" /> {t("returnedToPmo")}
        </span>
        {financeNotes && <span className="text-[10px] text-slate-500 line-clamp-2">{financeNotes}</span>}
        <span className="text-[10px] text-slate-400">{t("waitingPmoResubmit")}</span>
      </div>
    );
  }

  if (statusCode !== "notified" || !canVerify) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
        <Clock className="h-3.5 w-3.5" /> {statusCode === "notified" ? t("waitingFinanceVerification") : t("waitingPmo")}
      </span>
    );
  }

  function submit(action: "receive" | "revision") {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(async () => {
      setError(null);
      const result = action === "receive" ? await acknowledgeFinanceHandoff(opportunityId, fd) : await requestRevisionFinanceHandoff(opportunityId, fd);
      if (!result.ok) { setError(result.error); return; }
      setMode("idle");
    });
  }

  if (mode === "revision") {
    return (
      <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-1.5 min-w-[220px] bg-red-50 p-2 rounded-lg border border-red-200">
        <textarea name="finance_notes" rows={2} placeholder={t("revisionPlaceholder")} className="rounded border border-red-300 px-2 py-1 text-xs" autoFocus />
        <div className="flex gap-1.5">
          <button type="button" disabled={isPending} onClick={() => submit("revision")} className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
            {t("returnAction")}
          </button>
          <button type="button" onClick={() => setMode("idle")} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">{tc("cancel")}</button>
        </div>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>
    );
  }

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-1.5 min-w-[200px]">
      <div className="flex gap-1.5">
        <button type="button" disabled={isPending} onClick={() => submit("receive")} className="inline-flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
          <CheckCircle2 className="h-3 w-3" /> {t("received")}
        </button>
        <button type="button" disabled={isPending} onClick={() => setMode("revision")} className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50">
          <RotateCcw className="h-3 w-3" /> {t("returnAction")}
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
