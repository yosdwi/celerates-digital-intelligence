"use client";
import { useState, useTransition } from "react";
import { updateMonthlyBillingAmount } from "../../actions";
import { formatThousands, stripThousands } from "@/lib/money-format";

export function BillingCell({ billingId, amount }: { billingId: string | null; amount: number }) {
  const [value, setValue] = useState(amount);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!billingId) {
    return <span className="text-slate-300">-</span>;
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="w-full text-right hover:bg-slate-100 rounded px-1 py-0.5">
        {value ? value.toLocaleString("id-ID") : "0"}
      </button>
    );
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      defaultValue={formatThousands(value)}
      autoFocus
      disabled={isPending}
      className="w-24 text-right rounded border border-brand-300 px-1 py-0.5 text-xs"
      onInput={(e) => { e.currentTarget.value = formatThousands(e.currentTarget.value); }}
      onBlur={(e) => {
        const newValue = Number(stripThousands(e.currentTarget.value)) || 0;
        setValue(newValue);
        setEditing(false);
        startTransition(() => updateMonthlyBillingAmount(billingId, newValue));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}