"use client";
import { useState } from "react";
import { MoneyInput } from "./form-fields";
import { addOneYear } from "@/lib/date-utils";

type EmployeeOption = {
  id: string;
  employee_no: string;
  candidate_name: string | null;
  position_name: string | null;
  deal_start_date: string | null;
  deal_end_date: string | null;
  deal_price_amount: number | null;
  deal_basic_salary_amount: number | null;
  deal_functional_allowance_amount: number | null;
  deal_transport_allowance_amount: number | null;
  deal_project_allowance_amount: number | null;
  deal_accommodation_allowance_amount: number | null;
  deal_field_allowance_amount: number | null;
  deal_overtime_allowance_amount: number | null;
  /** Start date kontrak (induk) HR paling awal -- dasar hitung Increment Date otomatis (+1 tahun). */
  contract_start_date?: string | null;
  /** Requisition & PQ Tracker hasil derivasi dari onboarding_request_id employee -- dasar auto-select. */
  default_requisition_id?: string | null;
  default_pq_tracker_id?: string | null;
};

type RequisitionOption = { id: string; client_name: string; position_name: string | null };
type PqOption = { id: string; pq_no: string | null; client_name: string; approval_date: string | null };

export function EmployeePicker({
  employees,
  initialSelectedId,
  requisitionOptions,
  pqOptions,
}: {
  employees: EmployeeOption[];
  initialSelectedId?: string;
  requisitionOptions: RequisitionOption[];
  pqOptions: PqOption[];
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? "");
  const selected = employees.find((e) => e.id === selectedId);

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Employee <span className="text-red-500">*</span></span>
        <select
          name="employee_id"
          required
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">- pilih -</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.employee_no} - {e.candidate_name ?? "-"}</option>
          ))}
        </select>
      </label>

      {selected && (
        <div className="sm:col-span-3 rounded-lg bg-brand-50 border border-brand-100 px-4 py-3 text-xs text-slate-700 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <span><span className="text-slate-500">Nama:</span> {selected.candidate_name ?? "-"}</span>
          <span><span className="text-slate-500">Positions:</span> {selected.position_name ?? "-"}</span>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Requisition (Client/Project)</span>
        <select key={`requisition_id-${selectedId}`} name="requisition_id" defaultValue={selected?.default_requisition_id ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">- pilih -</option>
          {requisitionOptions.map((r) => <option key={r.id} value={r.id}>{r.client_name} - {r.position_name}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">PQ Tracker (opsional, buat acuan durasi)</span>
        <select key={`pq_tracker_id-${selectedId}`} name="pq_tracker_id" defaultValue={selected?.default_pq_tracker_id ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">- pilih -</option>
          {pqOptions.map((pq) => <option key={pq.id} value={pq.id}>{pq.pq_no} - {pq.client_name} ({pq.approval_date ?? "-"})</option>)}
        </select>
      </label>

      <AutoField label="Increment Date" name="increment_date" type="date" selectedId={selectedId} defaultValue={addOneYear(selected?.contract_start_date)} hint="Otomatis: tanggal mulai kontrak HR + 1 tahun, bisa diedit" />
      <AutoField label="Start Date" name="start_date" type="date" selectedId={selectedId} defaultValue={selected?.deal_start_date ?? ""} />
      <AutoField label="End Date" name="end_date" type="date" selectedId={selectedId} defaultValue={selected?.deal_end_date ?? ""} />
      <AutoField label="Price (Rp/bulan)" name="price_amount" type="money" selectedId={selectedId} defaultValue={selected?.deal_price_amount ?? ""} />
      <AutoField label="Basic Salary" name="basic_salary_amount" type="money" selectedId={selectedId} defaultValue={selected?.deal_basic_salary_amount ?? ""} />
      <AutoField label="Functional Allowance" name="functional_allowance_amount" type="money" selectedId={selectedId} defaultValue={selected?.deal_functional_allowance_amount ?? ""} />
      <AutoField label="Transport Allowance" name="transport_allowance_amount" type="money" selectedId={selectedId} defaultValue={selected?.deal_transport_allowance_amount ?? ""} />
      <AutoField label="Project Allowance" name="project_allowance_amount" type="money" selectedId={selectedId} defaultValue={selected?.deal_project_allowance_amount ?? ""} />
      <AutoField label="Accommodation Allowance" name="accommodation_allowance_amount" type="money" selectedId={selectedId} defaultValue={selected?.deal_accommodation_allowance_amount ?? ""} />
      <AutoField label="Business Trip (Uang Lapangan)" name="field_allowance_amount" type="money" selectedId={selectedId} defaultValue={selected?.deal_field_allowance_amount ?? ""} />
      <AutoField label="Overtime" name="overtime_allowance_amount" type="money" selectedId={selectedId} defaultValue={selected?.deal_overtime_allowance_amount ?? ""} />
    </>
  );
}

function AutoField({
  label,
  name,
  type,
  selectedId,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type: "date" | "number" | "money";
  selectedId: string;
  defaultValue: string | number;
  hint?: string;
}) {
  const baseClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {type === "money" ? (
        <MoneyInput key={`${name}-${selectedId}`} name={name} defaultValue={String(defaultValue ?? "")} className={baseClass} />
      ) : (
        <input
          key={`${name}-${selectedId}`}
          name={name}
          type={type}
          defaultValue={defaultValue}
          className={baseClass}
        />
      )}
      <span className="mt-1 block text-xs text-slate-400">{hint ?? "Otomatis dari data TA yang sudah Deal, bisa diedit"}</span>
    </label>
  );
}