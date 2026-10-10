"use client";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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

  // The form used to expand inside the 190 px action cell and made the row 300 px tall (SALES-UX-004); it is a
  // dialog now. Escape closes it unless the conversion is running.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !isPending) setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, isPending]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return; // cegah klik dobel
    const fd = new FormData(e.currentTarget);
    startTransition(() => convertToRequisition(opportunityTrackerId, fd));
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 block text-center w-full">
        Convert to Requisition
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" onClick={() => !isPending && setOpen(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Convert to Requisition"
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-slate-900">Convert to Requisition</h2>
            <input name="position_name" placeholder="Positions" required autoFocus defaultValue={positionName ?? ""} disabled={isPending} className={input} />
            <input name="headcount_target" type="number" placeholder="Headcount" defaultValue={headcountTarget ?? ""} disabled={isPending} className={input} />
            <select name="priority_code" defaultValue="" required disabled={isPending} className={input}>
              <option value="" disabled>{t("choosePriority")}</option>
              <option value="p0">P0</option>
              <option value="p1">P1</option>
              <option value="p2">P2</option>
              <option value="p3">P3</option>
            </select>
            <MoneyInput name="price_amount" placeholder="Price (Rp/bulan)" defaultValue={priceAmount?.toString() ?? ""} className={input} />
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={isPending} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
                {isPending ? tc("saving") : tc("save")}
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">
                {tc("cancel")}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </>
  );
}
