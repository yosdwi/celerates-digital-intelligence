"use client";
// PMO → Finance handoff on a phone (doc 18 §16). The same server actions as desktop (upsertFinanceHandoff,
// acknowledgeFinanceHandoff, requestRevisionFinanceHandoff); they re-check division access and state.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, RotateCcw, Send } from "lucide-react";
import { upsertFinanceHandoff } from "@/app/pmo/actions";
import { acknowledgeFinanceHandoff, requestRevisionFinanceHandoff } from "@/app/finance/actions";
import { BottomSheet, buttonClass } from "../primitives";

const field = "mt-1 w-full rounded-xl border border-[#d5dbe5] bg-j-surface px-3 py-2.5 text-[15px] text-j-ink outline-none focus:border-j-accent";

export function SubmitToFinance({ opportunityId, invoiceId, docUrl, resubmit }: { opportunityId: string; invoiceId: string; docUrl: string | null; resubmit: boolean }) {
  const t = useTranslations("mobile.pmo.handoff");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (form: HTMLFormElement, notify: boolean) => {
    const data = new FormData(form);
    data.set("notify", notify ? "true" : "false");
    setError(null);
    start(async () => {
      const result = await upsertFinanceHandoff(opportunityId, invoiceId, data);
      if (!result.ok) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass.primary} data-action="submit-to-finance">
        <Send aria-hidden className="h-[18px] w-[18px]" />
        {resubmit ? t("resubmit") : t("submit")}
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("submit")}>
        <form
          className="flex flex-col gap-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget, true);
          }}
        >
          <label className="text-[13px] font-semibold text-j-muted">
            {t("docLink")}
            <input name="doc_url" type="url" required defaultValue={docUrl ?? ""} placeholder="https://" className={field} />
          </label>
          <label className="text-[13px] font-semibold text-j-muted">
            {t("notes")}
            <textarea name="notes" rows={2} className={field} />
          </label>
          <p className="text-xs text-j-muted">{t("consequence")}</p>
          {error && (
            <p role="alert" className="text-sm font-semibold text-[#a8261c]">
              {error}
            </p>
          )}
          <div className="flex gap-2.5">
            <button type="button" disabled={pending} onClick={(e) => submit(e.currentTarget.form!, false)} className={buttonClass.secondary}>
              {t("saveOnly")}
            </button>
            <button type="submit" disabled={pending} className={buttonClass.primary}>
              {pending ? "…" : t("send")}
            </button>
          </div>
        </form>
      </BottomSheet>
    </>
  );
}

export function FinanceVerify({ opportunityId }: { opportunityId: string }) {
  const t = useTranslations("mobile.pmo.handoff");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (form: HTMLFormElement, accept: boolean) => {
    const data = new FormData(form);
    setError(null);
    start(async () => {
      const result = accept ? await acknowledgeFinanceHandoff(opportunityId, data) : await requestRevisionFinanceHandoff(opportunityId, data);
      if (!result.ok) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass.primary} data-action="finance-verify">
        <CheckCircle2 aria-hidden className="h-[18px] w-[18px]" />
        {t("verify")}
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("verify")}>
        <form className="flex flex-col gap-3 pb-2" onSubmit={(e) => e.preventDefault()}>
          <label className="text-[13px] font-semibold text-j-muted">
            {t("financeNotes")}
            <textarea name="finance_notes" rows={3} className={field} />
          </label>
          <p className="text-xs text-j-muted">{t("revisionRule")}</p>
          {error && (
            <p role="alert" className="text-sm font-semibold text-[#a8261c]">
              {error}
            </p>
          )}
          <div className="flex gap-2.5">
            <button type="button" disabled={pending} onClick={(e) => act(e.currentTarget.form!, false)} className={buttonClass.secondary}>
              <RotateCcw aria-hidden className="h-[18px] w-[18px]" />
              {t("return")}
            </button>
            <button type="button" disabled={pending} onClick={(e) => act(e.currentTarget.form!, true)} className={buttonClass.primary}>
              {pending ? "…" : t("accept")}
            </button>
          </div>
        </form>
      </BottomSheet>
    </>
  );
}
