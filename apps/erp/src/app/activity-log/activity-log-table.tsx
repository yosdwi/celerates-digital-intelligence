"use client";
import { useTableFilter } from "@/hooks/use-table-filter";
import { PaginationControls } from "@/components/pagination-controls";
import { Avatar } from "@/components/avatar";
import { Pill, type PillVariant } from "@/components/pill";
import { useTranslations } from "next-intl";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { SortableTh } from "@/components/sortable-th";

export type ActivityLogRow = {
  id: string;
  division_label: string;
  action_type: string;
  entity_label: string;
  page_label: string | null;
  actor_name: string;
  created_at: string;
};

const ACTION_VARIANTS: Record<string, PillVariant> = {
  create: "success",
  update: "info",
  delete: "critical",
};

export function ActivityLogTable({ data, divisionOptions }: { data: ActivityLogRow[]; divisionOptions: string[] }) {
  const t = useTranslations("activityLog");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data, 30);
  const ACTION_LABELS: Record<string, string> = { create: t("actionAdd"), update: t("actionUpdate"), delete: t("actionDelete") };

  const filters = [
    { key: "division_label", label: t("division"), options: divisionOptions.map((d) => [d, d] as const) },
    { key: "action_type", label: t("action"), options: [["create", t("actionAdd")], ["update", t("actionUpdate")], ["delete", t("actionDelete")]] as const },
  ];

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
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1">
          <SlidersHorizontal className="h-3.5 w-3.5 text-violet-500 ml-1" />
          {filters.map((f) => {
            const activeValue = activeFilters[f.key];
            const isActive = !!activeValue;
            return (
              <select
                key={f.key}
                value={activeValue ?? ""}
                onChange={(e) => setActiveFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className={`rounded-lg border-0 px-2 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-100 ${
                  isActive ? "bg-violet-100 text-violet-800 font-medium" : "bg-transparent text-slate-600 hover:bg-slate-50"
                }`}
              >
                <option value="">{f.label}: {t("all")}</option>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            );
          })}
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

        <span className="text-xs text-slate-400 ml-auto">{filtered.length} {t("of")} {data.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <SortableTh
                label={t("time")}
                sortKey="created_at"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[150px]"
              />
              <SortableTh
                label={t("user")}
                sortKey="actor_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[150px]"
              />
              <th className="px-4 py-3 min-w-[130px]">{t("division")}</th>
              <SortableTh
                label={t("action")}
                sortKey="action_type"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[90px]"
              />
              <th className="px-4 py-3 min-w-[130px]">{t("page")}</th>
              <th className="px-4 py-3 min-w-[250px]">{t("description")}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((log) => (
              <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                <td className="px-4 py-3 text-slate-500 text-xs">{new Date(log.created_at).toLocaleString("id-ID")}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <span className="flex items-center gap-2">
                    <Avatar name={log.actor_name} size="sm" />
                    {log.actor_name}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{log.division_label}</td>
                <td className="px-4 py-3">
                  <Pill variant={ACTION_VARIANTS[log.action_type] ?? "neutral"}>
                    {ACTION_LABELS[log.action_type] ?? log.action_type}
                  </Pill>
                </td>
                <td className="px-4 py-3 text-slate-600">{log.page_label ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{log.entity_label}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">{t("noActivity")}</td></tr>
            )}
          </tbody>
        </table>
        <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
      </div>
    </div>
  );
}
