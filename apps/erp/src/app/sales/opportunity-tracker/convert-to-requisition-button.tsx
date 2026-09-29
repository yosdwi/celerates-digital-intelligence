"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { convertToRequisition } from "./actions";
import { MoneyInput } from "@/components/form-fields";

export function ConvertToRequisitionButton({
  opportunityTrackerId,
  positionName,
  headcountTarget,
  priceAmount,
}: {
  opportunityTrackerId: string;
  positionName?: string | null;
  headcountTarget?: number | null;
  priceAmount?: number | null;
}) {
  const t = useTranslations("sales.opportunityTracker");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 block text-center w-full">
        Convert to Requisition
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return; // cegah klik dobel
    const fd = new FormData(e.currentTarget);
    startTransition(() => convertToRequisition(opportunityTrackerId, fd));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5 rounded-lg border border-purple-200 bg-purple-50 p-2">
      <input name="position_name" placeholder="Positions" required defaultValue={positionName ?? ""} disabled={isPending} className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
      <input name="headcount_target" type="number" placeholder="Headcount" defaultValue={headcountTarget ?? ""} disabled={isPending} className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
      <select name="priority_code" defaultValue="" required disabled={isPending} className="w-full rounded border border-slate-300 px-2 py-1 text-xs">
        <option value="" disabled>{t("choosePriority")}</option>
        <option value="p0">P0</option>
        <option value="p1">P1</option>
        <option value="p2">P2</option>
        <option value="p3">P3</option>
      </select>
      <MoneyInput
        name="price_amount"
        placeholder="Price (Rp/bulan)"
        defaultValue={priceAmount?.toString() ?? ""}
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
      />
      <div className="flex gap-1.5">
        <button type="submit" disabled={isPending} className="rounded bg-purple-600 px-2 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50">
          {isPending ? tc("saving") : tc("save")}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}