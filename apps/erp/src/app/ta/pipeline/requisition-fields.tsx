"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PicSelect } from "@/components/pic-select";
import { MoneyInput } from "@/components/form-fields";

type RequisitionOption = {
  id: string;
  client_name: string;
  position_name: string;
  service_type_code: string | null;
  level_code: string | null;
  price_amount: number | null;
  ta_pic_name: string;
};

const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;

export function RequisitionFields({
  requisitions,
  picNames,
  currentPath,
  onRequisitionChange,
}: {
  requisitions: RequisitionOption[];
  picNames: string[];
  currentPath: string;
  /** Dipanggil tiap kali Requisition yang dipilih berubah -- dipakai parent untuk
   *  koordinasi state dengan CandidatePicker (mis. flag "Recommended" berdasarkan posisi). */
  onRequisitionChange?: (selected: RequisitionOption | undefined) => void;
}) {
  const t = useTranslations("ta.pipeline.requisitionFields");
  const [selectedId, setSelectedId] = useState("");
  const selected = requisitions.find((r) => r.id === selectedId);

  function handleChange(id: string) {
    setSelectedId(id);
    onRequisitionChange?.(requisitions.find((r) => r.id === id));
  }

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Requisition <span className="text-red-500">*</span></span>
        <select
          name="requisition_id"
          required
          value={selectedId}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t("selectPlaceholder")}</option>
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
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{t("levelForThisPosition")}</span>
        <select
          key={`level-${selectedId}`}
          name="level_code"
          defaultValue={selected?.level_code ?? ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">-</option>
          {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="mt-1 block text-xs text-slate-400">{t("autoFromRequisition")}</span>
      </label>

      <PicSelect
        key={`ta-pic-${selectedId}`}
        name="ta_pic_name"
        label="TA PIC"
        defaultValue={selected?.ta_pic_name ?? ""}
        options={picNames}
        required
        currentPath={currentPath}
      />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{t("priceRpPerMonth")}</span>
        <MoneyInput
          key={`price-${selectedId}`}
          name="price_amount"
          defaultValue={selected?.price_amount != null ? String(selected.price_amount) : ""}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-xs text-slate-400">{t("autoFromRequisition")}</span>
      </label>
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