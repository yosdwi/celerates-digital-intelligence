"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Field, SelectField } from "@/components/form-fields";
import { formatThousands, stripThousands } from "@/lib/money-format";

// Sama seperti monthsBetween di src/components/opportunity-picker.tsx.
function monthsBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

// Sama seperti SALES_TYPES di src/components/opportunity-picker.tsx.
const SALES_TYPES = [
  ["farming", "Farming"], ["new_closing", "New Closing"], ["overtime", "Overtime"],
  ["business_trip", "Business Trip"], ["other", "Other"], ["medical", "Medical"],
] as const;

export function EditContractForm({
  action,
  defaultMonthlyValue,
  defaultStartDate,
  defaultEndDate,
  defaultSalesType,
  defaultNotes,
  backHref,
}: {
  action: (formData: FormData) => Promise<void> | void;
  defaultMonthlyValue: string;
  defaultStartDate: string;
  defaultEndDate: string;
  defaultSalesType: string;
  defaultNotes: string;
  backHref: string;
}) {
  const t = useTranslations("pmo.contracts.editPage");
  const tc = useTranslations("common");
  const [monthly, setMonthly] = useState(defaultMonthlyValue);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  const duration = useMemo(() => (startDate && endDate ? monthsBetween(startDate, endDate) : 0), [startDate, endDate]);
  const total = useMemo(() => (Number(monthly) || 0) * duration, [monthly, duration]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    action(new FormData(e.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{t("monthlyProjectValue")}</span>
        <input
          type="text"
          inputMode="numeric"
          value={formatThousands(monthly)}
          onChange={(e) => setMonthly(stripThousands(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        />
        <input type="hidden" name="monthly_value_amount" value={monthly} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{t("totalProjectValue")}</span>
        <input readOnly value={total ? total.toLocaleString("id-ID") : ""} placeholder="-" className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600" />
        <input type="hidden" name="total_value_amount" value={total || ""} />
        <span className="mt-1 block text-xs text-slate-400">{t("autoFromDates")}</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{t("contractDurationMonths")}</span>
        <input readOnly value={duration || ""} placeholder="-" className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600" />
        <input type="hidden" name="contract_duration_months" value={duration || ""} />
        <span className="mt-1 block text-xs text-slate-400">{t("autoFromDates")}</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Start Date</span>
        <input type="date" name="start_date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">End Date</span>
        <input type="date" name="end_date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
      </label>
      <SelectField label="Sales Type" name="sales_type_code" options={SALES_TYPES} defaultValue={defaultSalesType} />

      <div className="sm:col-span-3">
        <Field label="Notes" name="notes" defaultValue={defaultNotes} textarea />
      </div>

      <div className="sm:col-span-3 flex gap-3 pt-2">
        <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
          {t("saveChanges")}
        </button>
        <Link href={backHref} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {tc("cancel")}
        </Link>
      </div>
    </form>
  );
}
