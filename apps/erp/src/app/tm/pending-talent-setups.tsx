"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createTalentAssignment } from "./actions";
import type { PendingTalentSetup } from "@/lib/pq-approval";
import { AlertCircle } from "lucide-react";
import { MoneyInput } from "@/components/form-fields";

const STATUS_OPTIONS = [
  ["on_project", "On Project"], ["idle", "Idle"], ["waiting_for_project_onboard", "Waiting for Project Onboard"],
] as const;

export function PendingTalentSetups({ items }: { items: PendingTalentSetup[] }) {
  const t = useTranslations("tm.talentsBook.pendingSetups");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = items.filter((i) => !dismissed.has(i.employeeId));

  if (visible.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="h-4.5 w-4.5 text-amber-600" />
        <h2 className="text-sm font-semibold text-amber-800">
          {t("heading", { count: visible.length })}
        </h2>
      </div>
      <p className="text-xs text-amber-700 mb-4">
        {t("description")}
      </p>
      <div className="space-y-2">
        {visible.map((item) => (
          <PendingTalentRow key={item.employeeId} item={item} onDone={() => setDismissed((prev) => new Set(prev).add(item.employeeId))} />
        ))}
      </div>
    </section>
  );
}

function PendingTalentRow({ item, onDone }: { item: PendingTalentSetup; onDone: () => void }) {
  const t = useTranslations("tm.talentsBook.pendingSetups");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createTalentAssignment(fd);
      onDone();
    });
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="font-medium text-slate-900">{item.candidateName ?? item.employeeNo}</span>{" "}
          <span className="text-slate-400">({item.employeeNo})</span>
          <p className="text-xs text-slate-500">
            {item.optyNo ? `Opty ${item.optyNo}` : t("noOpportunity")} &middot; {item.clientName ?? "-"} &middot; {item.positionName ?? "-"}
          </p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
            {t("createButton")}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4 border-t border-slate-100 pt-3">
          <input type="hidden" name="employee_id" value={item.employeeId} />
          {item.requisitionId && <input type="hidden" name="requisition_id" value={item.requisitionId} />}
          {item.opportunityId && <input type="hidden" name="pq_tracker_id" value={item.opportunityId} />}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Status</span>
            <select name="status_code" defaultValue="on_project" className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none">
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Start Date</span>
            <input type="date" name="start_date" defaultValue={item.startDate ?? ""} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Price (Rp/bulan)</span>
            <MoneyInput name="price_amount" defaultValue={item.priceAmount?.toString() ?? ""} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none" />
          </label>
          <div className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">End Date</span>
            <p className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-600">{item.endDate ?? "-"}</p>
          </div>
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
