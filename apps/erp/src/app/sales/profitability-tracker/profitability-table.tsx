"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { Pill } from "@/components/pill";
import { Avatar } from "@/components/avatar";
import { GridCard } from "@/components/grid-card";
import { useToast } from "@/components/toast-provider";
import { syncProfitabilityFromTalents } from "./actions";
import { SortableTh } from "@/components/sortable-th";
import { RefreshCw, Search, RotateCcw } from "lucide-react";

type ProfitabilityRow = {
  id: string;
  talent_name: string;
  client_name: string;
  role: string | null;
  price_amount: number;
  cogs_amount: number;
  margin_amount: number;
  margin_percent: number;
  generated_by_name: string;
};

function rupiah(v: number): string {
  return `Rp ${v.toLocaleString("id-ID")}`;
}

export function ProfitabilityTable({
  data, year, month,
}: {
  data: ProfitabilityRow[];
  year: number;
  month: number;
}) {
  const t = useTranslations("sales.profitabilityTracker");
  const { showToast } = useToast();
  const {
    query, setQuery, filtered, paginated,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data, 50);
  const [view, setView] = useState<TableView>("table");
  const [isSyncing, startSyncing] = useTransition();

  function handleSync() {
    startSyncing(async () => {
      const res = await syncProfitabilityFromTalents(year, month);
      if (!res.ok) { showToast(res.error, "error"); return; }
      showToast(
        res.data.skipped
          ? t("syncSuccessWithSkipped", { synced: res.data.synced, skipped: res.data.skipped })
          : t("syncSuccess", { synced: res.data.synced })
      );
    });
  }

  return (
    <div>
      <div className="px-6 py-3.5 border-b border-slate-100 bg-white/60 backdrop-blur-xl flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white pl-8 pr-3.5 py-2 text-sm w-full max-w-xs transition-colors focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-100 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Filter
          </button>
        )}

        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} /> {isSyncing ? t("syncing") : t("syncFromTalentsBook")}
        </button>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} dari {data.length}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "table" && (
        <div className="overflow-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
                <SortableTh
                  label="Talent"
                  sortKey="talent_name"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                  className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[160px]"
                />
                <SortableTh
                  label="Client"
                  sortKey="client_name"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                  className="px-4 py-3 sticky left-[160px] bg-violet-50 z-10 min-w-[160px]"
                />
                <th className="px-4 py-3 sticky left-[320px] bg-violet-50 z-10 min-w-[140px] border-r border-slate-200">Role</th>
                <th className="px-4 py-3 min-w-[140px]">{t("priceMonthCol")}</th>
                <th className="px-4 py-3 min-w-[140px]">{t("cogsMonthCol")}</th>
                <th className="px-4 py-3 min-w-[140px]">Margin (Rp)</th>
                <SortableTh
                  label="Margin (%)"
                  sortKey="margin_percent"
                  activeSortKey={sortKey}
                  direction={sortDirection}
                  onSort={toggleSort}
                  className="px-4 py-3 min-w-[110px]"
                />
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                  <td className="px-4 py-3 sticky left-0 bg-white z-0 font-medium text-slate-900">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={r.talent_name} size="sm" />
                      {r.talent_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 sticky left-[160px] bg-white z-0 text-slate-600">{r.client_name}</td>
                  <td className="px-4 py-3 sticky left-[320px] bg-white z-0 text-slate-600 border-r border-slate-200">{r.role ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{rupiah(r.price_amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{rupiah(r.cogs_amount)}</td>
                  <td className={`px-4 py-3 font-medium ${r.margin_amount < 0 ? "text-red-600" : "text-emerald-700"}`}>{rupiah(r.margin_amount)}</td>
                  <td className="px-4 py-3">
                    <Pill variant={r.margin_percent < 0 ? "critical" : r.margin_percent < 15 ? "warning" : "success"}>
                      {r.margin_percent.toFixed(1)}%
                    </Pill>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400">{t("noDataForPeriod")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {paginated.map((r) => (
            <GridCard key={r.id} accent={r.margin_percent < 0 ? "rose" : r.margin_percent < 15 ? "amber" : "emerald"}>
              <div className="flex items-center gap-2.5">
                <Avatar name={r.talent_name} />
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900 truncate">{r.talent_name}</p>
                  <p className="text-xs font-mono text-slate-400">{r.client_name} &middot; {r.role ?? "-"}</p>
                </div>
              </div>
              <div className="space-y-1 text-xs mt-3">
                <div className="flex justify-between"><span className="text-slate-400">Price</span><span className="text-slate-600">{rupiah(r.price_amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">COGS</span><span className="text-slate-600">{rupiah(r.cogs_amount)}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Margin</span>
                  <Pill variant={r.margin_percent < 0 ? "critical" : r.margin_percent < 15 ? "warning" : "success"}>
                    {rupiah(r.margin_amount)} ({r.margin_percent.toFixed(1)}%)
                  </Pill>
                </div>
              </div>
            </GridCard>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full px-6 py-10 text-center text-slate-400">{t("noDataForPeriod")}</div>
          )}
        </div>
      )}
    </div>
  );
}
