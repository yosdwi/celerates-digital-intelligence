"use client";
import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

export function ExpandableSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className={
        expanded
          // "group is-expanded" -- dibaca lewat Tailwind group-[.is-expanded]:
          // variant di tabel-tabel di dalamnya, supaya area scroll tabel yang
          // di mode normal di-cap max-h-[480px] (biar kartu tetap ringkas) bisa
          // ikut melar ngisi tinggi layar penuh begitu di-fullscreen -- tanpa
          // itu, area interaktif (termasuk pagination) tetap kepotong 480px
          // walau section-nya sendiri sudah fixed inset-0.
          ? "group is-expanded fixed inset-0 z-50 bg-white overflow-hidden flex flex-col"
          : "rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-16px_rgba(15,23,42,0.12)] overflow-hidden transition-shadow duration-300 hover:shadow-[0_1px_2px_rgba(15,23,42,0.05),0_22px_40px_-16px_rgba(15,23,42,0.16)]"
      }
    >
      <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between bg-white/60 backdrop-blur-xl shrink-0">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          title={expanded ? "Minimize" : "Lebarkan full screen"}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
      <div className={expanded ? "flex-1 min-h-0 overflow-auto flex flex-col" : ""}>{children}</div>
    </section>
  );
}