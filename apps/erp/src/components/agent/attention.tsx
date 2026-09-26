"use client";
// `Perlu perhatian`: deterministic ERP rule groups, unchanged wording/counts/links (M1 adds only `Tanyakan`).
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { MODULES, type OperationalGroup } from "@/lib/operations/policy";
export function AttentionGroup({ group, onAsk }: { group: OperationalGroup; onAsk?: (group: OperationalGroup) => void }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {MODULES[group.module]}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">
            {group.title}
          </h3>
        </div>
        <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-800">
          {group.count}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {group.count} {group.unit} · {group.source}
      </p>
      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-brand-600">
          Mengapa perlu ditinjau?
        </summary>
        <p className="pt-2 leading-relaxed">{group.rule}</p>
      </details>
      <ul className="mt-3 divide-y divide-slate-100">
        {group.items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-2 py-2 text-xs text-slate-700 hover:text-brand-600"
            >
              <span className="break-words">{item.label}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      {group.count > group.items.length && (
        <p className="mt-1 text-xs text-slate-500">
          Menampilkan {group.items.length} dari {group.count}; buka modul untuk
          sisanya.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={group.href}
          className="inline-flex items-center gap-2 text-xs font-semibold text-brand-600"
        >
          {group.action}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {onAsk && (
          <button
            type="button"
            onClick={() => onAsk(group)}
            aria-label={`Tanyakan: ${group.title}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Tanyakan
          </button>
        )}
      </div>
    </article>
  );
}
