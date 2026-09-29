"use client";
import { useState, useTransition } from "react";

export type TargetField = { key: string; label: string; required?: boolean };

export function ColumnMappingForm({
  headers,
  targetFields,
  currentMapping,
  onSave,
}: {
  headers: string[];
  targetFields: TargetField[];
  currentMapping: Record<string, string>;
  onSave: (mapping: Record<string, string>) => Promise<void>;
}) {
  const [mapping, setMapping] = useState<Record<string, string>>(currentMapping);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await onSave(mapping);
      setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-xs font-medium text-slate-500 uppercase tracking-wide px-1">
        <span>Kolom di Sheet Anda</span>
        <span>Jadi Field ERP Apa</span>
      </div>
      {headers.map((header) => (
        <div key={header} className="grid grid-cols-2 gap-3 items-center">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{header}</div>
          <select
            value={mapping[header] ?? ""}
            onChange={(e) => setMapping((prev) => ({ ...prev, [header]: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">- Jangan diimport -</option>
            {targetFields.map((f) => (
              <option key={f.key} value={f.key}>{f.label} {f.required ? "*" : ""}</option>
            ))}
          </select>
        </div>
      ))}
      <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {isPending ? "Menyimpan..." : "Simpan Pemetaan"}
      </button>
      {saved && <span className="ml-3 text-sm text-green-600">Tersimpan.</span>}
    </form>
  );
}