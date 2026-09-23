"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createProjectContract } from "./actions";
import type { PendingContractSetup } from "@/lib/pq-approval";
import { AlertCircle } from "lucide-react";
import { MoneyInput } from "@/components/form-fields";

export function PendingContractSetups({ items }: { items: PendingContractSetup[] }) {
  const t = useTranslations("pmo");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = items.filter((i) => !dismissed.has(i.opportunityId));

  if (visible.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="h-4.5 w-4.5 text-amber-600" />
        <h2 className="text-sm font-semibold text-amber-800">
          {t("needsFollowUpTitle", { count: visible.length })}
        </h2>
      </div>
      <p className="text-xs text-amber-700 mb-4">
        {t("needsFollowUpSubtitle")}
      </p>
      <div className="space-y-2">
        {visible.map((item) => (
          <PendingContractRow key={item.opportunityId} item={item} onDone={() => setDismissed((prev) => new Set(prev).add(item.opportunityId))} />
        ))}
      </div>
    </section>
  );
}

function PendingContractRow({ item, onDone }: { item: PendingContractSetup; onDone: () => void }) {
  const t = useTranslations("pmo");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createProjectContract(fd);
      onDone();
    });
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="font-medium text-slate-900">{item.clientName}</span>{" "}
          <span className="text-slate-400">({item.optyNo})</span>{" "}
          {item.source === "won_direct" ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Won langsung dari Sales</span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Via TM (talent onboard)</span>
          )}
          <p className="text-xs text-slate-500">
            {item.candidateName ?? "-"} &middot; {item.positionName ?? "-"}
          </p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
            {t("createAContract")}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4 border-t border-slate-100 pt-3">
          <input type="hidden" name="opportunity_id" value={item.opportunityId} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Monthly Value (Rp)</span>
            <MoneyInput name="monthly_value_amount" defaultValue={item.priceAmount?.toString() ?? ""} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Start Date</span>
            <input type="date" name="start_date" defaultValue={item.startDate ?? ""} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">End Date</span>
            <input type="date" name="end_date" defaultValue={item.endDate ?? ""} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {isPending ? tc("saving") : tc("save")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              {tc("cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
