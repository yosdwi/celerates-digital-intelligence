"use client";
import { useState } from "react";
import { Field } from "@/components/form-fields";

type LeadOption = { id: string; lead_no: string; client_name: string };

/**
 * Opsional: tarik data klien dari Lead yang sudah ada di Marketing (biar Lead
 * No <-> Opty No kelihatan konek), atau biarkan kosong dan isi Nama Klien
 * manual seperti biasa buat opportunity yang nggak berasal dari Marketing.
 */
export function LeadPicker({ leads }: { leads: LeadOption[] }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = leads.find((l) => l.id === selectedId);

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Dari Marketing Lead</span>
        <select
          name="lead_id"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">- Tidak dari Lead / Manual -</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>{l.lead_no} - {l.client_name}</option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-400">
          {selected ? `Leads No: ${selected.lead_no}` : "Kosongkan kalau opportunity ini bukan dari Marketing."}
        </span>
      </label>

      <Field
        key={`client-name-${selectedId}`}
        label="Nama Klien"
        name="client_name"
        defaultValue={selected?.client_name ?? ""}
        required
        hint={selected ? "Otomatis dari Lead, bisa diedit" : undefined}
      />
    </>
  );
}
