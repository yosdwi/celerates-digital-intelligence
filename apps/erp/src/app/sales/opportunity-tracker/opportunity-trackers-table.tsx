"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { OptyStatusBadge } from "./opty-status-badge";
import { OptyStatusSelector } from "./opty-status-selector";
import { ConvertToRequisitionButton } from "./convert-to-requisition-button";
import { DeleteTrackerButton } from "./delete-tracker-button";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { NewBadge } from "@/components/new-badge";
import { Avatar } from "@/components/avatar";
import { GridCard, type CardAccent } from "@/components/grid-card";
import { Pill } from "@/components/pill";
import { SortableTh } from "@/components/sortable-th";
import Link from "next/link";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";

type Tracker = {
  id: string;
  opty_no: string;
  lead_no: string | null;
  client_name: string;
  service_type_code: string | null;
  client_type_code: string | null;
  requirement_summary: string | null;
  detail_requirement: string | null;
  opty_status_code: string;
  sales_qualified: boolean;
  progress_notes: string | null;
  estimated_deal_amount: number | null;
  sales_pic_name: string;
  last_communication_date: string | null;
  bante_score: number | null;
  dropped_reason: string | null;
  position_name: string | null;
  level_code: string | null;
  headcount_target: number | null;
  price_amount: number | null;
  price_period_code: string | null;
  estimated_duration_months: number | null;
  created_at: Date | string | null;
};

const PRICE_PERIOD_LABELS: Record<string, string> = {
  monthly: "/bulan", project: "/project", yearly: "/tahun", daily: "/hari",
};

const OPTY_STATUS_OPTIONS = [
  ["cv_submission", "CV Submission"], ["solutioning", "Solutioning"],
  ["proposal_sent", "Proposal Sent"], ["win", "Win"], ["dropped", "Dropped"],
  ["need_action", "Need Action"],
] as const;

const OPTY_STATUS_ACCENT: Record<string, CardAccent> = { win: "emerald", dropped: "rose", need_action: "amber" };

const VALID_SERVICE_TYPES = new Set(["outsourcing", "headhunting", "outplacement", "managed_service", "project_based", "rpo", "training", "license", "hardware"]);
const VALID_CLIENT_TYPES = new Set(["existing", "new"]);
const VALID_LEVELS = new Set(["internship", "entry_level", "junior", "middle", "senior", "lead", "manager", "vp"]);

export function OpportunityTrackersTable({ data, convertedIds }: { data: Tracker[]; convertedIds: string[] }) {
  const t = useTranslations("sales.opportunityTracker");
  const tc = useTranslations("common");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const convertedSet = new Set(convertedIds);
  const [view, setView] = useState<TableView>("table");

  const filters = [{ key: "opty_status_code", label: "Opty Status", options: OPTY_STATUS_OPTIONS }];

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

        <span className="text-xs text-slate-400 ml-auto">{t("ofCount", { filtered: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="px-6 pt-3 text-xs text-amber-600">
        🟡 {t("importWarning")}
      </div>

      {view === "table" && (
      <>
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[190px]">{t("actionStatus")}</th>
              <SortableTh
                label="Opty No"
                sortKey="opty_no"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[190px] bg-violet-50 z-10 min-w-[130px]"
              />
              <th className="px-4 py-3 sticky left-[320px] bg-violet-50 z-10 min-w-[130px]">Leads No</th>
              <SortableTh
                label={t("clientCol")}
                sortKey="client_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[450px] bg-violet-50 z-10 min-w-[130px] border-r border-slate-200"
              />
              <th className="px-4 py-3 min-w-[100px]">Client Type</th>
              <th className="px-4 py-3 min-w-[110px]">Service Type</th>
              <th className="px-4 py-3 min-w-[130px]">Positions</th>
              <th className="px-4 py-3 min-w-[100px]">Level</th>
              <th className="px-4 py-3 min-w-[90px]">Headcount</th>
              <th className="px-4 py-3 min-w-[110px]">Durasi</th>
              <th className="px-4 py-3 min-w-[100px]">Qualified</th>
              <th className="px-4 py-3 min-w-[180px]">Requirement</th>
              <th className="px-4 py-3 min-w-[180px]">Detail Requirement</th>
              <th className="px-4 py-3 min-w-[140px]">Closing Price Deal</th>
              <SortableTh
                label={t("dealPriceCol")}
                sortKey="price_amount"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[140px]"
              />
              <th className="px-4 py-3 min-w-[130px]">Sales PIC</th>
              <th className="px-4 py-3 min-w-[120px]">Last Comm.</th>
              <th className="px-4 py-3 min-w-[80px]">BANTE</th>
              <th className="px-4 py-3 min-w-[180px]">Progress Notes</th>
              <th className="px-4 py-3 min-w-[150px]">Dropped Reason</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((row) => renderTrackerRow(row))}
            {filtered.length === 0 && (
              <tr><td colSpan={20} className="px-6 py-10 text-center text-slate-400">{t("noMatch")}</td></tr>
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
            {paginated.map((t) => renderTrackerCard(t))}
          </div>
          <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
        </>
      )}
    </div>
  );

  function renderTrackerCard(row: Tracker) {
    const isConverted = convertedSet.has(row.id);
    const canConvert = row.sales_qualified && !isConverted;
    return (
      <GridCard key={row.id} accent={OPTY_STATUS_ACCENT[row.opty_status_code] ?? "violet"}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar name={row.client_name} />
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-900 flex items-center gap-1.5 truncate">{row.client_name} <NewBadge createdAt={row.created_at} /></p>
              <p className="text-xs font-mono text-slate-400">{row.opty_no}</p>
            </div>
          </div>
          <OptyStatusBadge optyStatusCode={row.opty_status_code} />
        </div>
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2"><span className="text-slate-400">Positions</span><span className="text-slate-700 text-right">{row.position_name ?? "-"}</span></div>
          <div className="flex justify-between gap-2"><span className="text-slate-400">Sales PIC</span><span className="text-slate-700 text-right">{row.sales_pic_name}</span></div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">{t("dealPriceCol")}</span>
            <span className="text-slate-700 text-right">{row.price_amount ? `Rp ${row.price_amount.toLocaleString("id-ID")}${PRICE_PERIOD_LABELS[row.price_period_code ?? ""] ?? ""}` : "-"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Qualified</span>
            <span>{row.sales_qualified
              ? <Pill variant="success">Qualified</Pill>
              : <Pill variant="neutral">{t("notQualified")}</Pill>}</span>
          </div>
        </div>
        <div className="mt-auto pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <Link href={`/sales/opportunity-tracker/${row.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
          <span className="text-slate-300">|</span>
          <DeleteTrackerButton trackerId={row.id} />
          {canConvert && (
            <ConvertToRequisitionButton
              opportunityTrackerId={row.id}
              positionName={row.position_name}
              headcountTarget={row.headcount_target}
              priceAmount={row.price_amount}
            />
          )}
          {isConverted && <span className="text-xs text-slate-400">{t("alreadyConverted")}</span>}
        </div>
      </GridCard>
    );
  }

  function renderTrackerRow(row: Tracker) {
              const isConverted = convertedSet.has(row.id);
              const canConvert = row.sales_qualified && !isConverted;
              return (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                  <td className="px-4 py-3 sticky left-0 bg-white z-0 space-y-1.5">
                    <div className="flex gap-2 items-center">
                      <Link href={`/sales/opportunity-tracker/${row.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                      <span className="text-slate-300">|</span>
                      <DeleteTrackerButton trackerId={row.id} />
                    </div>
                    <OptyStatusBadge optyStatusCode={row.opty_status_code} />
                    <OptyStatusSelector id={row.id} currentOptyStatus={row.opty_status_code} currentSalesQualified={row.sales_qualified} />
                    {canConvert && (
                      <ConvertToRequisitionButton
                        opportunityTrackerId={row.id}
                        positionName={row.position_name}
                        headcountTarget={row.headcount_target}
                        priceAmount={row.price_amount}
                      />
                    )}
                    {isConverted && <span className="text-xs text-slate-400 block">{t("alreadyConverted")}</span>}
                  </td>
                  <td className="px-4 py-3 sticky left-[190px] bg-white z-0 font-mono text-xs text-slate-500">{row.opty_no}</td>
                  <td className="px-4 py-3 sticky left-[320px] bg-white z-0 font-mono text-xs text-slate-500">{row.lead_no ?? "-"}</td>
                  <td className="px-4 py-3 sticky left-[450px] bg-white z-0 font-medium text-slate-900 border-r border-slate-200">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={row.client_name} size="sm" />
                      <span className="flex items-center gap-1.5">{row.client_name} <NewBadge createdAt={row.created_at} /></span>
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-slate-600 ${!VALID_CLIENT_TYPES.has(row.client_type_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>
                    {row.client_type_code ?? "-"}
                  </td>
                  <td className={`px-4 py-3 text-slate-600 ${!VALID_SERVICE_TYPES.has(row.service_type_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>
                    {row.service_type_code ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.position_name ?? "-"}</td>
                  <td className={`px-4 py-3 text-slate-600 ${!VALID_LEVELS.has(row.level_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>
                    {row.level_code ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.headcount_target ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.estimated_duration_months ? `${row.estimated_duration_months} bulan` : "-"}</td>
                  <td className="px-4 py-3">
                    {row.sales_qualified
                      ? <Pill variant="success">Qualified</Pill>
                      : <Pill variant="neutral">{t("notQualified")}</Pill>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.requirement_summary ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={row.detail_requirement ?? ""}>{row.detail_requirement ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.estimated_deal_amount ? `Rp ${row.estimated_deal_amount.toLocaleString("id-ID")}` : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.price_amount ? `Rp ${row.price_amount.toLocaleString("id-ID")}${PRICE_PERIOD_LABELS[row.price_period_code ?? ""] ?? ""}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.sales_pic_name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.last_communication_date ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.bante_score ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.progress_notes ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.dropped_reason ?? "-"}</td>
                </tr>
      );
  }
}