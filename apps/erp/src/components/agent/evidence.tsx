"use client";
// Evidence and run-part renderers. The evidence badge makes the three kinds of truth visible (doc 14 §3, doc 15 §8).
import Link from "next/link";
import { AlertCircle, CheckCircle2, Circle, FileSearch, Loader2 } from "lucide-react";
import type { Evidence, EvidenceType, Provenance } from "@/lib/agent/run-state";

const BADGE: Record<EvidenceType, { label: string; className: string }> = {
  erp_fact: { label: "Fakta ERP", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  signal: { label: "Sinyal", className: "bg-amber-50 text-amber-900 ring-amber-200" },
  knowledge: { label: "Pengetahuan disetujui", className: "bg-violet-50 text-violet-800 ring-violet-200" },
  document: { label: "Berkas Anda", className: "bg-sky-50 text-sky-800 ring-sky-200" },
  observation: { label: "Observasi", className: "bg-slate-100 text-slate-700 ring-slate-200" },
  inference: { label: "Inferensi", className: "bg-pink-50 text-pink-800 ring-pink-200" },
};

export function EvidenceBadge({ type }: { type: EvidenceType }) {
  const badge = BADGE[type];
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${badge.className}`}>{badge.label}</span>;
}

function sourceLine(item: Evidence) {
  const s = item.source ?? {};
  const bits = [];
  if (s.version !== undefined && s.version !== null) bits.push(`versi ${String(s.version)}`);
  if (typeof s.as_of === "string") bits.push(`per ${new Date(s.as_of).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} WIB`);
  if (item.match === "similarity") bits.push("kemiripan, bukan kata kunci");
  return bits.join(" · ");
}

export function EvidenceCard({ item }: { item: Evidence }) {
  const meta = sourceLine(item);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3" data-evidence-type={item.type}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-900">
          {item.cite && <span className="mr-1.5 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-600">{item.cite}</span>}
          {item.title}
        </h4>
        <EvidenceBadge type={item.type} />
      </div>
      {item.detail.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {item.detail.map((d, i) => (
            <li key={i} className="break-words">{d}</li>
          ))}
        </ul>
      )}
      {!!item.withheld?.length && <p className="mt-2 text-[11px] text-slate-500">Tidak dibagikan ke Agent: {item.withheld.join(", ")}</p>}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{meta}</span>
        {item.href && (
          <Link href={item.href} className="font-semibold text-brand-600 hover:underline">
            Buka di ERP →
          </Link>
        )}
      </div>
    </article>
  );
}

export function RunProgress({ steps, running }: { steps: { name: string; done: boolean }[]; running: boolean }) {
  if (!steps.length && running)
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menyiapkan…
      </p>
    );
  return (
    <ol className="space-y-1 text-xs text-slate-600" aria-label="Langkah Agent">
      {steps.map((step, i) => (
        <li key={i} className="flex items-center gap-2">
          {step.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />}
          {step.name}
        </li>
      ))}
    </ol>
  );
}

export function RunError({ message }: { message: string }) {
  return (
    <div role="alert" className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

export function ToolTrace({ toolName, result }: { toolName: string; result?: unknown }) {
  return (
    <li className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
      {result === undefined ? <Circle className="h-3 w-3" /> : <FileSearch className="h-3 w-3 text-slate-400" />}
      {toolName}
    </li>
  );
}

/** Keeps the three kinds of truth visible for the answer text itself (doc 14 §3): model text is inference. */
export function ProvenanceLine({ value }: { value: Provenance }) {
  if (value.mode === "model")
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500" data-provenance="model">
        <EvidenceBadge type="inference" />
        Disusun model dari {value.cited.length} bukti yang dikutip{value.cited.length ? ` (${value.cited.join(", ")})` : ""}. Fakta ada di kartu bukti; periksa sebelum bertindak.
      </p>
    );
  return (
    <p className="text-[11px] text-slate-500" data-provenance="deterministic">
      Disusun tanpa model dari aturan, record ERP, dan pengetahuan disetujui.
    </p>
  );
}
