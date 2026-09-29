"use client";
import { useState } from "react";

type EmployeeOption = {
  id: string;
  employee_no: string;
  candidate_name: string | null;
  position_name: string | null;
  last_start_date: string | null;
  last_end_date: string | null;
  last_contract_no: string | null;
  last_basic_salary_amount: number | null;
  last_transport_allowance_amount: number | null;
  last_project_allowance_amount: number | null;
  last_accommodation_allowance_amount: number | null;
  last_overtime_allowance_amount: number | null;
  price_amount: number | null;
};

/**
 * Begitu pilih Employee, kotak info nunjukin data kontrak+gaji AKTIF SEKARANG
 * (field "Last X" di ERP Flow asli) -- supaya requester bisa lihat baseline-nya
 * sebelum mengisi "Propose X" (nilai baru yang diajukan).
 */
export function EmployeePickerWithCurrent({ employees }: { employees: EmployeeOption[] }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = employees.find((e) => e.id === selectedId);

  const lastGross = selected
    ? (selected.last_basic_salary_amount ?? 0) +
      (selected.last_transport_allowance_amount ?? 0) +
      (selected.last_project_allowance_amount ?? 0) +
      (selected.last_accommodation_allowance_amount ?? 0) +
      (selected.last_overtime_allowance_amount ?? 0)
    : 0;

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
        <div className="sm:col-span-3 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <span className="sm:col-span-4 font-medium text-amber-800">Data Aktif Sekarang (baseline):</span>
          <span><span className="text-slate-500">Positions:</span> {selected.position_name ?? "-"}</span>
          <span><span className="text-slate-500">Last Start:</span> {selected.last_start_date ?? "-"}</span>
          <span><span className="text-slate-500">Last End:</span> {selected.last_end_date ?? "-"}</span>
          <span><span className="text-slate-500">Nomor Kontrak Terbaru:</span> {selected.last_contract_no ?? "-"}</span>
          <span><span className="text-slate-500">Basic Salary:</span> {selected.last_basic_salary_amount ? `Rp ${selected.last_basic_salary_amount.toLocaleString("id-ID")}` : "-"}</span>
          <span><span className="text-slate-500">Gross Salary:</span> {lastGross > 0 ? `Rp ${lastGross.toLocaleString("id-ID")}` : "-"}</span>
          <span><span className="text-slate-500">Price:</span> {selected.price_amount ? `Rp ${selected.price_amount.toLocaleString("id-ID")}` : "-"}</span>
          <span><span className="text-slate-500">Gross Margin (Estimasi):</span> {selected.price_amount != null ? `Rp ${(selected.price_amount - lastGross).toLocaleString("id-ID")}` : "-"}</span>
        </div>
      )}
    </>
  );
}