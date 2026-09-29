"use client";
import { useState } from "react";
import { SearchableSelect } from "./searchable-select";
import { SmartFileLink } from "./smart-file-link";


type CandidateOption = {
  id: string;
  candidate_no: string;
  candidate_name: string;
  wa_number: string | null;
  email: string | null;
  current_salary_amount: number | null;
  expected_salary_amount: number | null;
  candidate_source_code: string | null;
  position_name?: string | null;
};

/** Heuristik sederhana: cocok kalau posisi candidate & requisition sama persis
 *  (case-insensitive) ATAU salah satu string memuat kata utama yang lain --
 *  cukup buat kasih sinyal "Recommended", bukan fuzzy-matching yang canggih. */
function isPositionMatch(candidatePosition: string | null | undefined, matchPositionName: string | null | undefined): boolean {
  if (!candidatePosition || !matchPositionName) return false;
  const a = candidatePosition.trim().toLowerCase();
  const b = matchPositionName.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

export function CandidatePicker({
  candidates,
  initialSelectedId,
  candidateCvUrls = {},
  matchPositionName,
}: {
  candidates: CandidateOption[];
  initialSelectedId?: string;
  candidateCvUrls?: Record<string, string | null>;
  /** Position name dari Requisition yang sedang terpilih (kalau ada) -- dipakai untuk
   *  menandai candidate dengan posisi yang cocok sebagai "Recommended" di daftar pilihan. */
  matchPositionName?: string | null;
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? "");
  const [sourceValue, setSourceValue] = useState(() => candidates.find((c) => c.id === initialSelectedId)?.candidate_source_code ?? "");

  const selected = candidates.find((c) => c.id === selectedId);

  function handleSelect(id: string) {
    setSelectedId(id);
    const c = candidates.find((x) => x.id === id);
    setSourceValue(c?.candidate_source_code ?? "");
  }

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Candidate <span className="text-red-500">*</span></span>
        <SearchableSelect
          name="candidate_id"
          required
          value={selectedId}
          onChange={handleSelect}
          placeholder="Cari nama atau nomor candidate..."
          options={candidates.map((c) => ({
            value: c.id,
            label: isPositionMatch(c.position_name, matchPositionName) ? `⭐ Recommended - ${c.candidate_name}` : c.candidate_name,
            sublabel: c.candidate_no,
          }))}
        />
      </label>

      {selected && (
        <div className="sm:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <ReadOnlyField label="WA" value={selected.wa_number ?? "-"} />
          <ReadOnlyField label="Email" value={selected.email ?? "-"} />
          <ReadOnlyField label="Current Salary" value={selected.current_salary_amount ? `Rp ${selected.current_salary_amount.toLocaleString("id-ID")}` : "-"} />
          <ReadOnlyField label="Expected Salary" value={selected.expected_salary_amount ? `Rp ${selected.expected_salary_amount.toLocaleString("id-ID")}` : "-"} />
          <ReadOnlyField label="CV Asli" value={<SmartFileLink value={candidateCvUrls[selected.id] ?? null} label="Lihat" />} />
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Candidate Source</span>
        <input name="candidate_source_code" value={sourceValue} onChange={(e) => setSourceValue(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      </label>
    </>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-center gap-1.5 w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-slate-700">{value}</div>
    </div>
  );
}
