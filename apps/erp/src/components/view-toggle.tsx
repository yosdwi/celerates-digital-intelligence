"use client";
import { LayoutGrid, List } from "lucide-react";

export type TableView = "table" | "grid";

/** Segmented control buat pilih tampilan tabel vs grid card -- dipakai di semua tabel list module. */
export function ViewToggle({ view, onChange }: { view: TableView; onChange: (v: TableView) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-white/80 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => onChange("table")}
        aria-pressed={view === "table"}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
          view === "table"
            ? "bg-gradient-to-br from-violet-600 to-violet-400 text-white shadow-[0_4px_10px_-3px_rgba(124,58,237,0.5)]"
            : "text-slate-500 hover:bg-slate-100"
        }`}
      >
        <List className="h-3.5 w-3.5" /> Tabel
      </button>
      <button
        type="button"
        onClick={() => onChange("grid")}
        aria-pressed={view === "grid"}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
          view === "grid"
            ? "bg-gradient-to-br from-violet-600 to-violet-400 text-white shadow-[0_4px_10px_-3px_rgba(124,58,237,0.5)]"
            : "text-slate-500 hover:bg-slate-100"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" /> Grid
      </button>
    </div>
  );
}
