"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { DeleteRequisitionButton } from "./delete-requisition-button";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { Pill, type PillVariant } from "@/components/pill";
import { NewBadge } from "@/components/new-badge";
import { Avatar } from "@/components/avatar";
import { GridCard, pickAccent } from "@/components/grid-card";
import { SortableTh } from "@/components/sortable-th";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";

type Requisition = {
  id: string;
  requisition_no: string;
  opty_no: string | null;
  opty_request_date: string | null;
  client_name: string;
  position_name: string;
  service_type_code: string | null;
  level_code: string | null;
  opty_status_code: string | null;
  headcount_target: number;
  priority_code: string;
  price_amount: number | null;
  estimated_duration_months: number | null;
  ta_pic_name: string;
  sales_pic_name: string | null;
  notes: string | null;
  created_at: Date | string | null;
};

const SERVICE_TYPES = [
  ["outsourcing", "Outsourcing"], ["headhunting", "Headhunting"], ["outplacement", "Outplacement"],
  ["managed_service", "Managed Service"], ["project_based", "Project Based"], ["rpo", "RPO"],
  ["training", "Training"], ["license", "License"], ["hardware", "Hardware"], ["replacement", "Replacement"],
] as const;
const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
const OPTY_STATUS = [
  ["on_hold", "Project on Hold"], ["client_not_responding", "Client Not Responding"],
  ["lost_pitching", "Lost on Pitching Period"], ["waiting_feedback", "Waiting for Feedback"],
  ["budget_on_hold", "Client Budget on Hold"], ["won", "Project Won"],
  ["closed_lost", "Closed Lost"], ["on_going_others", "Opty on Going Others"],
] as const;
const PRIORITIES = [["p0", "P0"], ["p1", "P1"], ["p2", "P2"], ["p3", "P3"]] as const;

const VALID_SERVICE_TYPES = new Set(["outsourcing", "headhunting", "outplacement", "managed_service", "project_based", "rpo", "training", "license", "hardware", "replacement"]);
const VALID_LEVELS = new Set(["internship", "entry_level", "junior", "middle", "senior", "lead", "manager", "vp"]);
const VALID_OPTY_STATUS = new Set(["on_hold", "client_not_responding", "lost_pitching", "waiting_feedback", "budget_on_hold", "won", "closed_lost", "on_going_others"]);

const OPTY_STATUS_VARIANT: Record<string, PillVariant> = {
  won: "success",
  closed_lost: "critical",
  lost_pitching: "critical",
  on_hold: "warning",
  client_not_responding: "warning",
  waiting_feedback: "warning",
  budget_on_hold: "warning",
  on_going_others: "info",
};
function optyStatusVariant(code: string | null): PillVariant {
  return OPTY_STATUS_VARIANT[code ?? ""] ?? "neutral";
}

export function RequisitionsTable({ data }: { data: Requisition[] }) {
  const t = useTranslations("ta.requisitions");
  const tc = useTranslations("common");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

  const filters = [
    { key: "priority_code", label: "Priority", options: PRIORITIES },
    { key: "opty_status_code", label: "Opty Status", options: OPTY_STATUS },
    { key: "service_type_code", label: "Service Type", options: SERVICE_TYPES },
    { key: "level_code", label: "Level", options: LEVELS },
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
                <option value="">{f.label}: {t("allOption")}</option>
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

        <span className="text-xs text-slate-400 ml-auto">{t("countOf", { filtered: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="px-6 pt-3 text-xs text-amber-600">
        🟡 {t("importWarning")}
      </div>

      {view === "table" && (
        <div>
          {/* max-h + overflow-auto eksplisit -- tanpa ini, browser mempromosikan
              overflow-x-auto jadi scroll container 2 arah tanpa tinggi tetap, dan
              `sticky` di <thead> jadi nempel ke div ini (yang ikut discroll bareng
              halaman) alih-alih benar-benar diam di layar. */}
          <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20">
                <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
                  <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[100px]">{t("action")}</th>
                  <th className="px-4 py-3 sticky left-[100px] bg-violet-50 z-10 min-w-[130px]">Requisition No</th>
                  <th className="px-4 py-3 sticky left-[230px] bg-violet-50 z-10 min-w-[130px]">ID Opty</th>
                  <th className="px-4 py-3 sticky left-[360px] bg-violet-50 z-10 min-w-[110px] border-r border-slate-200">Request Date</th>
                  <th className="px-4 py-3 min-w-[130px]">{t("client")}</th>
                  <SortableTh
                    label="Positions"
                    sortKey="position_name"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={toggleSort}
                    className="px-4 py-3 min-w-[130px]"
                  />
                  <th className="px-4 py-3 min-w-[110px]">Service Type</th>
                  <th className="px-4 py-3 min-w-[100px]">Level</th>
                  <th className="px-4 py-3 min-w-[120px]">Opty Status</th>
                  <SortableTh
                    label="Headcount"
                    sortKey="headcount_target"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={toggleSort}
                    className="px-4 py-3 min-w-[90px]"
                  />
                  <th className="px-4 py-3 min-w-[80px]">Priority</th>
                  <th className="px-4 py-3 min-w-[140px]">Price</th>
                  <SortableTh
                    label="Durasi"
                    sortKey="estimated_duration_months"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={toggleSort}
                    className="px-4 py-3 min-w-[110px]"
                  />
                  <th className="px-4 py-3 min-w-[130px]">TA PIC</th>
                  <th className="px-4 py-3 min-w-[130px]">Sales PIC</th>
                  <th className="px-4 py-3 min-w-[180px]">Details</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((req) => (
                  <tr key={req.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                    <td className="px-4 py-3 sticky left-0 bg-white z-0">
                      <div className="flex gap-2 items-center">
                        <Link href={`/ta/${req.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                        <span className="text-slate-300">|</span>
                        <DeleteRequisitionButton requisitionId={req.id} />
                      </div>
                    </td>
                    <td className="px-4 py-3 sticky left-[100px] bg-white z-0 font-mono text-xs text-slate-500">{req.requisition_no}</td>
                    <td className="px-4 py-3 sticky left-[230px] bg-white z-0 font-mono text-xs text-slate-500">{req.opty_no ?? "-"}</td>
                    <td className="px-4 py-3 sticky left-[360px] bg-white z-0 border-r border-slate-200 text-slate-600">{req.opty_request_date ?? "-"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <Avatar name={req.client_name} size="sm" />
                        {req.client_name}
                        <NewBadge createdAt={req.created_at} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{req.position_name}</td>
                    <td className={`px-4 py-3 text-slate-600 ${!VALID_SERVICE_TYPES.has(req.service_type_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>{req.service_type_code ?? "-"}</td>
                    <td className={`px-4 py-3 text-slate-600 ${!VALID_LEVELS.has(req.level_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>{req.level_code ?? "-"}</td>
                    <td className="px-4 py-3">
                      {req.opty_status_code == null ? (
                        <span className="text-slate-600">-</span>
                      ) : !VALID_OPTY_STATUS.has(req.opty_status_code) ? (
                        <span className="bg-amber-50 text-amber-700 font-medium px-2 py-1 rounded">{req.opty_status_code}</span>
                      ) : (
                        <Pill variant={optyStatusVariant(req.opty_status_code)}>{req.opty_status_code}</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{req.headcount_target}</td>
                    <td className="px-4 py-3 text-slate-600 uppercase">{req.priority_code}</td>
                    <td className="px-4 py-3 text-slate-600">{req.price_amount ? `Rp ${req.price_amount.toLocaleString("id-ID")}` : "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{req.estimated_duration_months ? `${req.estimated_duration_months} bulan` : "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{req.ta_pic_name}</td>
                    <td className="px-4 py-3 text-slate-600">{req.sales_pic_name ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{req.notes ?? "-"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={16} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
        </div>
      )}

      {view === "grid" && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {paginated.map((req, idx) => (
              <GridCard key={req.id} accent={pickAccent(idx)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <Avatar name={req.client_name} />
                    <div>
                      <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        {req.client_name}
                        <NewBadge createdAt={req.created_at} />
                      </div>
                      <div className="text-xs font-mono text-slate-400">{req.requisition_no}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <Link href={`/ta/${req.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteRequisitionButton requisitionId={req.id} />
                  </div>
                </div>
                <div className="mt-auto space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Positions</span>
                    <span className="text-slate-600 text-right">{req.position_name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Level</span>
                    <span className={`text-right ${!VALID_LEVELS.has(req.level_code ?? "") ? "bg-amber-50 text-amber-700 font-medium px-1 rounded" : "text-slate-600"}`}>{req.level_code ?? "-"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Headcount</span>
                    <span className="text-slate-600">{req.headcount_target}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Priority</span>
                    <span className="text-slate-600 uppercase">{req.priority_code}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">TA PIC</span>
                    <span className="text-slate-600 text-right">{req.ta_pic_name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Price</span>
                    <span className="text-slate-600">{req.price_amount ? `Rp ${req.price_amount.toLocaleString("id-ID")}` : "-"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Opty Status</span>
                    {req.opty_status_code == null ? (
                      <span className="text-slate-600">-</span>
                    ) : !VALID_OPTY_STATUS.has(req.opty_status_code) ? (
                      <span className="bg-amber-50 text-amber-700 font-medium px-1 rounded">{req.opty_status_code}</span>
                    ) : (
                      <Pill variant={optyStatusVariant(req.opty_status_code)}>{req.opty_status_code}</Pill>
                    )}
                  </div>
                </div>
              </GridCard>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</div>
            )}
          </div>
          <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
        </div>
      )}
    </div>
  );
}