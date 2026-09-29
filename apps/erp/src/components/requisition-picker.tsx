"use client";
import { useState } from "react";
import { PicSelect } from "@/components/pic-select";

type RequisitionOption = {
  id: string;
  client_name: string;
  position_name: string;
  service_type_code: string | null;
  level_code: string | null;
  ta_pic_name: string;
};

export function RequisitionPicker({
  requisitions,
  initialSelectedId,
  picNames,
  currentPath,
  fallbackTaPicName,
}: {
  requisitions: RequisitionOption[];
  initialSelectedId?: string;
  picNames: string[];
  currentPath: string;
  /** Dipakai kalau belum ada requisition terpilih (mis. record lama tanpa requisition_id) --
   *  supaya TA PIC yang udah pernah disimpan nggak keblank di halaman Edit. */
  fallbackTaPicName?: string;
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? "");
  const selected = requisitions.find((r) => r.id === selectedId);

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Requisition <span className="text-red-500">*</span></span>
        <select
          name="requisition_id"
          required
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">- pilih -</option>
          {requisitions.map((r) => (
            <option key={r.id} value={r.id}>{r.client_name} - {r.position_name}</option>
          ))}
        </select>
      </label>

      {selected && (
        <div className="sm:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <ReadOnlyField label="Client" value={selected.client_name} />
          <ReadOnlyField label="Position" value={selected.position_name} />
          <ReadOnlyField label="Service Type" value={selected.service_type_code ?? "-"} />
          <ReadOnlyField label="Level" value={selected.level_code ?? "-"} />
        </div>
      )}

      <PicSelect
        key={`ta-pic-${selectedId}`}
        name="ta_pic_name"
        label="TA PIC"
        defaultValue={selected?.ta_pic_name ?? fallbackTaPicName ?? ""}
        options={picNames}
        required
        currentPath={currentPath}
      />
    </>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-slate-700">{value}</div>
    </div>
  );
}