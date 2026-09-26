"use client";
// Import mapping card (ADR-011). Shows which file column feeds which ERP field, and lets the user correct it.
// A correction starts a new run; Intelligence re-validates it and ERP still validates every row before anything applies.
import { useState } from "react";
import { Columns3 } from "lucide-react";
import type { AgentAction, MappingCardData } from "@/lib/agent/run-state";

export function MappingCard({ data, onRun }: { data: MappingCardData; onRun: (action: AgentAction) => void }) {
  const [command, setCommand] = useState(data.command);
  const [mapping, setMapping] = useState<Record<string, string>>(data.command === command ? data.mapping : {});
  const spec = data.commands.find((c) => c.kind === command);
  const used = new Set(Object.values(mapping).filter(Boolean));
  const ready = !!spec && spec.params.every((p) => !p.required || mapping[p.name]);
  const select = "mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400";
  return (
    <details open={data.open} className="rounded-xl border border-slate-200 bg-white p-3 text-xs" data-mapping-card>
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-slate-800">
        <Columns3 className="h-3.5 w-3.5" /> {data.open ? "Lengkapi pemetaan kolom" : "Ubah pemetaan kolom"}
      </summary>
      <label className="mt-3 block text-[11px] font-medium text-slate-600">
        Impor sebagai
        <select
          className={select}
          value={command}
          onChange={(e) => {
            setCommand(e.target.value);
            setMapping(e.target.value === data.command ? data.mapping : {});
          }}
        >
          {data.commands.map((c) => (
            <option key={c.kind} value={c.kind}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {spec?.params.map((p) => (
          <label key={p.name} className="block text-[11px] font-medium text-slate-600">
            {p.label}
            {p.required && <span className="text-red-600"> *</span>}
            <select className={select} value={mapping[p.name] ?? ""} onChange={(e) => setMapping({ ...mapping, [p.name]: e.target.value })}>
              <option value="">— tidak dipakai —</option>
              {data.columns.map((c) => (
                <option key={c} value={c} disabled={used.has(c) && mapping[p.name] !== c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">ERP tetap memvalidasi setiap baris sebelum Anda konfirmasi.</p>
        <button
          type="button"
          disabled={!ready}
          onClick={() =>
            onRun({
              label: `Impor ulang dengan pemetaan ${spec?.label ?? ""}`.trim(),
              skill: "import_dataset",
              args: { dataset_id: data.dataset_id, command, mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)) },
            })
          }
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Siapkan usulan
        </button>
      </div>
    </details>
  );
}
