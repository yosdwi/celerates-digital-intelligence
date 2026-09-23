"use client";
import { useState, useMemo } from "react";
import { formatMonthNameYear } from "@/lib/month-format";
import { formatThousands, stripThousands } from "@/lib/money-format";

type OpportunityOption = {
  id: string;
  opty_no: string;
  client_name: string;
  position_name: string | null;
  sales_pic_name: string;
  service_type_code: string;
  client_type_code?: string | null;
  price_amount?: number | null;
  start_date?: string | null;
  end_date?: string | null;
};

const SALES_TYPES = [
  ["farming", "Farming"], ["new_closing", "New Closing"], ["overtime", "Overtime"],
  ["business_trip", "Business Trip"], ["other", "Other"], ["medical", "Medical"],
] as const;

// Belum ada field "Sales Type" di modul Sales, jadi kita tebak default-nya dari
// Client Type (existing/new) yang paling dekat maknanya -- tetap bisa diedit manual
// kalau assumption ini meleset atau butuh kategori lain (overtime/business_trip/dst).
const CLIENT_TYPE_TO_SALES_TYPE: Record<string, string> = {
  existing: "farming",
  new: "new_closing",
};

function monthsBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

type Variant = "document" | "contract" | "invoice";

export function OpportunityPicker({
  opportunities,
  withDocumentFields = false,
  withContractFields = false,
  withInvoiceFields = false,
  billingMonthsByOpportunity,
}: {
  opportunities: OpportunityOption[];
  /** Render field tambahan (Sales Type, PQ Price, PQ Total, PO Date) khusus form Document Tracker. */
  withDocumentFields?: boolean;
  /** Render field tambahan (Sales Type, Nominal/Bulan, Durasi, Total, Start/End) khusus form A.Contract. */
  withContractFields?: boolean;
  /** Render field tambahan (Services Month Start, Price/Month) khusus form TM Invoice. */
  withInvoiceFields?: boolean;
  /** Daftar bulan billing schedule (dari A.Contract) per opportunity_id -- dipakai buat dropdown Services Month. */
  billingMonthsByOpportunity?: Record<string, string[]>;
}) {
  const variant: Variant | null = withDocumentFields
    ? "document"
    : withContractFields
    ? "contract"
    : withInvoiceFields
    ? "invoice"
    : null;

  const [selectedId, setSelectedId] = useState("");
  const selected = opportunities.find((o) => o.id === selectedId);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [price, setPrice] = useState<string>("");

  function handleSelect(id: string) {
    setSelectedId(id);
    const opty = opportunities.find((o) => o.id === id);
    setStartDate(opty?.start_date ?? "");
    setEndDate(opty?.end_date ?? "");
    setPrice(opty?.price_amount != null ? String(opty.price_amount) : "");
  }

  const duration = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return monthsBetween(startDate, endDate);
  }, [startDate, endDate]);

  const total = useMemo(() => {
    const p = Number(price) || 0;
    return p * duration;
  }, [price, duration]);

  const salesTypeDefault = selected?.client_type_code ? (CLIENT_TYPE_TO_SALES_TYPE[selected.client_type_code] ?? "") : "";

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Opportunity <span className="text-red-500">*</span></span>
        <select
          name="opportunity_id"
          required
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">- pilih -</option>
          {opportunities.map((o) => (
            <option key={o.id} value={o.id}>{o.client_name} - {o.position_name ?? "-"}</option>
          ))}
        </select>
      </label>

      {selected && (
        <div className="sm:col-span-3 rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-xs text-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <span><span className="text-slate-500">ID Opty:</span> {selected.opty_no}</span>
          <span><span className="text-slate-500">Client:</span> {selected.client_name}</span>
          <span><span className="text-slate-500">Sales PIC:</span> {selected.sales_pic_name}</span>
          <span><span className="text-slate-500">Service Type:</span> {selected.service_type_code}</span>
        </div>
      )}

      {variant === "document" && (
        <>
          <SalesTypeField selectedId={selectedId} defaultValue={salesTypeDefault} />

          <NumberField label="PQ Price" name="pq_price" value={price} onChange={setPrice} hint="Otomatis dari Price Sales, bisa diedit" />
          <ReadOnlyField label="PQ Total" name="pq_total" value={total} hint="Otomatis: durasi PO (bulan) × PQ Price" />
          <DateField label="Start Date PO" name="po_start_date" value={startDate} onChange={setStartDate} />
          <DateField label="End Date PO" name="po_end_date" value={endDate} onChange={setEndDate} />
        </>
      )}

      {variant === "contract" && (
        <>
          <SalesTypeField selectedId={selectedId} defaultValue={salesTypeDefault} />

          <NumberField label="Nominal Project / Bulan" name="monthly_value_amount" value={price} onChange={setPrice} hint="Otomatis dari Price Sales, bisa diedit" />
          <ReadOnlyField label="Contract Duration (Bulan)" name="contract_duration_months" value={duration} hint="Otomatis: dari Start & End Date" />
          <ReadOnlyField label="Nominal Project (Total)" name="total_value_amount" value={total} hint="Otomatis: Durasi × Nominal/Bulan" />
          <DateField label="Start Date" name="start_date" value={startDate} onChange={setStartDate} />
          <DateField label="End Date" name="end_date" value={endDate} onChange={setEndDate} />
        </>
      )}

      {variant === "invoice" && (
        <>
          <ServicesMonthField selectedId={selectedId} months={billingMonthsByOpportunity?.[selectedId] ?? []} />
          <NumberField label="Price / Month" name="price_per_month" value={price} onChange={setPrice} hint="Otomatis dari Price Sales, bisa diedit" />
        </>
      )}
    </>
  );
}

function SalesTypeField({ selectedId, defaultValue }: { selectedId: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">Sales Type</span>
      <select
        key={`sales-type-${selectedId}`}
        name="sales_type_code"
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
      >
        <option value="">-</option>
        {SALES_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <span className="mt-1 block text-xs text-slate-400">Otomatis dari Client Type Sales, bisa diedit</span>
    </label>
  );
}

function NumberField({ label, name, value, onChange, hint }: { label: string; name: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={formatThousands(value)}
        onChange={(e) => onChange(stripThousands(e.target.value))}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
      />
      <input type="hidden" name={name} value={value} />
      <span className="mt-1 block text-xs text-slate-400">{hint}</span>
    </label>
  );
}

function ServicesMonthField({ selectedId, months }: { selectedId: string; months: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">Services Month</span>
      <select
        key={`services-month-${selectedId}`}
        name="services_month_start"
        disabled={months.length === 0}
        defaultValue={months[0] ?? ""}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white disabled:bg-slate-100"
      >
        {months.length === 0 && <option value="">Belum ada billing schedule</option>}
        {months.map((m) => <option key={m} value={m}>{formatMonthNameYear(m)}</option>)}
      </select>
      <span className="mt-1 block text-xs text-slate-400">
        {months.length === 0 ? "Buat billing schedule dulu di A.Contract." : "Otomatis dari Billing Schedule A.Contract."}
      </span>
    </label>
  );
}

function DateField({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
      />
      <span className="mt-1 block text-xs text-slate-400">Otomatis dari Sales, bisa diedit</span>
    </label>
  );
}

function ReadOnlyField({ label, name, value, hint }: { label: string; name: string; value: number; hint: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        readOnly
        value={value ? value.toLocaleString("id-ID") : ""}
        placeholder="-"
        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
      />
      <input type="hidden" name={name} value={value || ""} />
      <span className="mt-1 block text-xs text-slate-400">{hint}</span>
    </label>
  );
}
