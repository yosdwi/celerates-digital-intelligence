"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { DeleteContractButton } from "./delete-contract-button";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { NewBadge } from "@/components/new-badge";
import { Avatar } from "@/components/avatar";
import { GridCard } from "@/components/grid-card";
import { Pill } from "@/components/pill";
import { SortableTh } from "@/components/sortable-th";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";

type ProjectContract = {
  id: string;
  opty_no: string | null;
  client_name: string | null;
  position_name: string | null;
  sales_pic_name: string | null;
  service_type_code: string | null;
  sales_type_code: string | null;
  monthly_value_amount: number | null;
  total_value_amount: number | null;
  contract_duration_months: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: Date | null;
};

const VALID_SALES_TYPES = new Set(["farming", "new_closing", "overtime", "business_trip", "other", "medical"]);

export function ContractsTable({ data }: { data: ProjectContract[] }) {
  const t = useTranslations("pmo.contracts.contractsTable");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

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

        <span className="text-xs text-slate-400 ml-auto">{t("countOfTotal", { count: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="px-6 pt-3 text-xs text-amber-600">
        {t("yellowCellNote")}
      </div>

      {view === "table" && (
      <>
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[100px]">{t("headers.action")}</th>
              <th className="px-4 py-3 sticky left-[100px] bg-violet-50 z-10 min-w-[130px]">{t("headers.optyId")}</th>
              <SortableTh
                label={t("headers.client")}
                sortKey="client_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[230px] bg-violet-50 z-10 min-w-[130px]"
              />
              <th className="px-4 py-3 sticky left-[360px] bg-violet-50 z-10 min-w-[130px] border-r border-slate-200">{t("headers.positions")}</th>
              <th className="px-4 py-3 min-w-[130px]">{t("headers.salesPic")}</th>
              <th className="px-4 py-3 min-w-[110px]">{t("headers.serviceType")}</th>
              <th className="px-4 py-3 min-w-[110px]">{t("headers.salesType")}</th>
              <th className="px-4 py-3 min-w-[150px]">{t("headers.monthlyValue")}</th>
              <th className="px-4 py-3 min-w-[150px]">{t("headers.totalValue")}</th>
              <th className="px-4 py-3 min-w-[130px]">{t("headers.durationMonths")}</th>
              <SortableTh
                label={t("headers.start")}
                sortKey="start_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <SortableTh
                label={t("headers.end")}
                sortKey="end_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <th className="px-4 py-3 min-w-[180px]">{t("headers.notes")}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                <td className="px-4 py-3 sticky left-0 bg-white z-0">
                  <div className="flex gap-2 items-center">
                    <Link href={`/pmo/contracts/${c.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{t("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteContractButton contractId={c.id} />
                  </div>
                </td>
                <td className="px-4 py-3 sticky left-[100px] bg-white z-0 font-mono text-xs text-slate-500">{c.opty_no ?? "-"}</td>
                <td className="px-4 py-3 sticky left-[230px] bg-white z-0 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <Avatar name={c.client_name ?? "-"} size="sm" />
                    {c.client_name ?? "-"}
                    <NewBadge createdAt={c.created_at} />
                  </div>
                </td>
                <td className="px-4 py-3 sticky left-[360px] bg-white z-0 text-slate-600 border-r border-slate-200">{c.position_name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.sales_pic_name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.service_type_code ?? "-"}</td>
                <td className={`px-4 py-3 text-slate-600 ${!VALID_SALES_TYPES.has(c.sales_type_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>{c.sales_type_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.monthly_value_amount ? `Rp ${c.monthly_value_amount.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.total_value_amount ? `Rp ${c.total_value_amount.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.contract_duration_months ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.start_date ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.end_date ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.notes ?? "-"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={13} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
      </>
      )}

      {view === "grid" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {paginated.map((c) => (
              <GridCard key={c.id} accent="violet">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-2 items-center">
                    <Link href={`/pmo/contracts/${c.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{t("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteContractButton contractId={c.id} />
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <Avatar name={c.client_name ?? "-"} />
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      {c.client_name ?? "-"}
                      <NewBadge createdAt={c.created_at} />
                    </p>
                    <p className="text-xs font-mono text-slate-400">{c.opty_no ?? "-"}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">{t("headers.positions")}</span><span className="text-slate-600">{c.position_name ?? "-"}</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t("headers.salesType")}</span>
                    {!VALID_SALES_TYPES.has(c.sales_type_code ?? "") ? (
                      <Pill variant="warning">{c.sales_type_code ?? "-"}</Pill>
                    ) : (
                      <span className="text-slate-600">{c.sales_type_code ?? "-"}</span>
                    )}
                  </div>
                  <div className="flex justify-between"><span className="text-slate-400">{t("headers.monthlyValue")}</span><span className="text-slate-600">{c.monthly_value_amount ? `Rp ${c.monthly_value_amount.toLocaleString("id-ID")}` : "-"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">{t("headers.totalValue")}</span><span className="text-slate-600">{c.total_value_amount ? `Rp ${c.total_value_amount.toLocaleString("id-ID")}` : "-"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">{t("duration")}</span><span className="text-slate-600">{t("monthsValue", { count: c.contract_duration_months ?? 0 })}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">{t("period")}</span><span className="text-slate-600">{t("periodRange", { start: c.start_date ?? "-", end: c.end_date ?? "-" })}</span></div>
                </div>
              </GridCard>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</div>
            )}
          </div>
          <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
        </>
      )}
    </div>
  );
}