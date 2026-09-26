"use client";
import { useState } from "react";

type FilterDef = {
  key: string;
  label: string;
  options: readonly (readonly [string, string])[];
};

export function TableControls<T extends Record<string, unknown>>({
  data,
  filters = [],
  searchPlaceholder = "Cari di semua kolom...",
  children,
}: {
  data: T[];
  filters?: FilterDef[];
  searchPlaceholder?: string;
  children: (filtered: T[]) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const filtered = data.filter((row) => {
    if (query.trim()) {
      const matchesSearch = Object.values(row).some(
        (v) => v != null && String(v).toLowerCase().includes(query.toLowerCase())
      );
      if (!matchesSearch) return false;
    }
    for (const [key, value] of Object.entries(activeFilters)) {
      if (value && String(row[key] ?? "") !== value) return false;
    }
    return true;
  });

  const hasActiveControls = query.trim() !== "" || Object.values(activeFilters).some(Boolean);

  return (
    <div>
      <div className="px-6 py-3.5 border-b border-slate-100 bg-white/60 backdrop-blur-xl flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm w-full max-w-xs transition-colors focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
        />
        {filters.map((f) => (
          <select
            key={f.key}
            value={activeFilters[f.key] ?? ""}
            onChange={(e) => setActiveFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none"
          >
            <option value="">{f.label}: Semua</option>
            {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        {hasActiveControls && (
          <button
            onClick={() => { setQuery(""); setActiveFilters({}); }}
            className="text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
          >
            Reset
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} dari {data.length}</span>
      </div>
      {children(filtered)}
    </div>
  );
}