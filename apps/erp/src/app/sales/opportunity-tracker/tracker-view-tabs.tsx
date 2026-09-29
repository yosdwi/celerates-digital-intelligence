"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ExpandableSection } from "@/components/expandable-section";
import { OpportunityTrackersTable } from "./opportunity-trackers-table";
import { OpportunityKanban } from "./opportunity-kanban";

const TABS = [
  { key: "list", label: "List" },
  { key: "kanban", label: "Kanban" },
] as const;

/**
 * Pembungkus baru di atas OpportunityTrackersTable yang SUDAH ADA -- komponen
 * tabel/grid-nya sendiri tidak disentuh sama sekali, cuma ditambah tab
 * "Kanban" sebagai tampilan alternatif baru.
 */
export function TrackerViewTabs({ data, convertedIds }: { data: Parameters<typeof OpportunityTrackersTable>[0]["data"]; convertedIds: string[] }) {
  const t = useTranslations("sales.opportunityTracker");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("list");

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
              tab === tb.key
                ? "bg-gradient-to-br from-violet-600 to-violet-400 text-white shadow-[0_4px_10px_-3px_rgba(124,58,237,0.5)]"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {tb.key === "list" ? t("listTabLabel") : t("kanbanTabLabel")}
          </button>
        ))}
      </div>

      {tab === "list" ? (
        <ExpandableSection title={t("listTitle", { count: data.length })}>
          <OpportunityTrackersTable data={data} convertedIds={convertedIds} />
        </ExpandableSection>
      ) : (
        <div className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-16px_rgba(15,23,42,0.12)] overflow-hidden">
          <OpportunityKanban data={data} />
        </div>
      )}
    </div>
  );
}
