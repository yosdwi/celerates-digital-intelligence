"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { DeleteTalentAssignmentButton } from "./delete-talent-assignment-button";
import { PaginationControls } from "@/components/pagination-controls";
import { prettify } from "@/components/dashboard-charts";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { Pill, type PillVariant } from "@/components/pill";
import { Avatar } from "@/components/avatar";
import { GridCard, type CardAccent } from "@/components/grid-card";
import { NewBadge } from "@/components/new-badge";
import { SortableTh } from "@/components/sortable-th";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";

function formatMoney(amount: number | null): string {
  return amount ? `Rp ${amount.toLocaleString("id-ID")}` : "-";
}

function formatDdMmYyyy(dateStr: string | null): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}-${m}-${y}`;
}

type TalentAssignment = {
    id: string;
    employee_id: string;
    employee_no: string | null;
    candidate_name: string | null;
  client_name: string | null;
  position_name: string | null;
  pq_no: string | null;
  opty_no: string | null;
  start_date: string | null;
  end_date: string | null;
  status_code: string | null;
  talent_track_code: string | null;
  increment_date: string | null;
  current_grading: string | null;
  current_salary_grade_code: string | null;
  price_amount: number | null;
  current_skill: string | null;
  current_certification: string | null;
  performance_appraisal_result: string | null;
  performance_review_result: string | null;
  people_summarize: string | null;
  increment_amount_deal: number | null;
  increment_percent_deal: number | null;
  status_all_data_code: string | null;
  notes: string | null;
  tax_bruto_amount: number | null;
  take_home_pay_amount: number | null;
  gross_salary_amount: number | null;
  basic_salary_amount: number | null;
  functional_allowance_amount: number | null;
  transport_allowance_amount: number | null;
  project_allowance_amount: number | null;
  accommodation_allowance_amount: number | null;
  field_allowance_amount: number | null;
  overtime_allowance_amount: number | null;
  kompensasi_amount: number | null;
  thr_allowance_amount: number | null;
  annual_bonus_allowance_amount: number | null;
  annual_medical_reimbursement_amount: number | null;
  laptop_ownership_amount: number | null;
  training_amount: number | null;
  refreshment_amount: number | null;
  bpjs_kesehatan_company_amount: number | null;
  jkk_amount: number | null;
  jkm_amount: number | null;
  jht_company_amount: number | null;
  jkp_amount: number | null;
  jp_company_amount: number | null;
  bpjs_kesehatan_employee_amount: number | null;
  jht_employee_amount: number | null;
  jp_employee_amount: number | null;
  management_fee_amount: number | null;
  total_cogs_amount: number | null;
  created_at: Date | null;
};

const STATUS_OPTIONS = [
  ["on_project", "On Project"], ["idle", "Idle"], ["out", "Out"], ["internal_project", "Internal Project"],
  ["resignation_on_progress", "Resignation on Progress"], ["waiting_for_project_onboard", "Waiting for Project Onboard"],
  ["not_in_assignment", "Not in Assignment"], ["promote", "Promote"],
] as const;
const TALENT_TRACKS = [["pm", "PM"], ["sad", "SAD"], ["bdcs", "BDCS"], ["das", "DAS"]] as const;

const VALID_STATUS = new Set(["on_project", "idle", "out", "internal_project", "resignation_on_progress", "waiting_for_project_onboard", "not_in_assignment", "promote"]);
const VALID_TRACKS = new Set(["pm", "sad", "bdcs", "das"]);
const VALID_GRADINGS = new Set(["g1", "g2", "g3", "g4", "g5", "g6", "g7"]);
const VALID_STATUS_ALL_DATA = new Set(["updated", "will_be_update", "obsolete"]);

const STATUS_VARIANTS: Record<string, PillVariant> = {
  on_project: "success",
  idle: "neutral",
  waiting_for_project_onboard: "neutral",
  not_in_assignment: "neutral",
  out: "warning",
  resignation_on_progress: "warning",
  promote: "info",
  internal_project: "info",
};
const STATUS_ALL_DATA_VARIANTS: Record<string, PillVariant> = {
  updated: "success",
  will_be_update: "warning",
  obsolete: "critical",
};

const STATUS_ACCENT: Record<string, CardAccent> = {
  on_project: "emerald",
  idle: "violet",
  waiting_for_project_onboard: "violet",
  not_in_assignment: "violet",
  out: "amber",
  resignation_on_progress: "amber",
  promote: "blue",
  internal_project: "blue",
};

export function TalentAssignmentsTable({ data }: { data: TalentAssignment[] }) {
  const t = useTranslations("tm.talentsBook");
  const tc = useTranslations("common");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

  const filters = [
    { key: "status_code", label: "Status", options: STATUS_OPTIONS },
    { key: "talent_track_code", label: "Track", options: TALENT_TRACKS },
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

        <span className="text-xs text-slate-400 ml-auto">{t("filteredCount", { filtered: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="px-6 pt-3 text-xs text-amber-600">
        {t("yellowCellHint")}
      </div>

      {view === "table" && (
      <>
      {/* max-h + overflow-auto eksplisit -- lihat opportunities-table.tsx: tanpa
          ini `sticky` di <thead> tidak akan diam di layar saat scroll 2 arah. */}
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[100px]">{t("colAction")}</th>
              <th className="px-4 py-3 sticky left-[100px] bg-violet-50 z-10 min-w-[130px]">Employee No</th>
              <SortableTh
                label={t("colName")}
                sortKey="candidate_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[230px] bg-violet-50 z-10 min-w-[150px]"
              />
              <th className="px-4 py-3 min-w-[130px]">ID Opty</th>
              <SortableTh
                label="Client"
                sortKey="client_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[380px] bg-violet-50 z-10 min-w-[130px] border-r border-slate-200"
              />
              <th className="px-4 py-3 min-w-[130px]">Positions</th>
              <th className="px-4 py-3 min-w-[130px]">PQ No</th>
              <SortableTh
                label="Start"
                sortKey="start_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <th className="px-4 py-3 min-w-[110px]">End</th>
              <th className="px-4 py-3 min-w-[120px]">Status</th>
              <th className="px-4 py-3 min-w-[130px]">Track</th>
              <th className="px-4 py-3 min-w-[110px]">Increment Date</th>
              <th className="px-4 py-3 min-w-[100px]">Grading</th>
              <th className="px-4 py-3 min-w-[130px]">Salary Grade</th>
              <th className="px-4 py-3 min-w-[130px]">Price</th>
              <th className="px-4 py-3 min-w-[150px]">Skill</th>
              <th className="px-4 py-3 min-w-[150px]">Certification</th>
              <th className="px-4 py-3 min-w-[150px]">Performance Appraisal</th>
              <th className="px-4 py-3 min-w-[150px]">Performance Review</th>
              <th className="px-4 py-3 min-w-[180px]">People Summarize</th>
              <th className="px-4 py-3 min-w-[140px]">Increment Amount Deal</th>
              <th className="px-4 py-3 min-w-[120px]">Increment % Deal</th>
              <th className="px-4 py-3 min-w-[120px]">Status All Data</th>
              <th className="px-4 py-3 min-w-[180px]">Notes</th>
              <th className="px-4 py-3 min-w-[130px]">Tax Bruto</th>
              <th className="px-4 py-3 min-w-[130px]">Take Home Pay</th>
              <th className="px-4 py-3 min-w-[130px]">Gross Salary</th>
              <th className="px-4 py-3 min-w-[130px]">Basic Salary</th>
              <th className="px-4 py-3 min-w-[150px]">Functional Allowance</th>
              <th className="px-4 py-3 min-w-[140px]">Transport Allowance</th>
              <th className="px-4 py-3 min-w-[140px]">Project Allowance</th>
              <th className="px-4 py-3 min-w-[160px]">Accommodation Allowance</th>
              <th className="px-4 py-3 min-w-[130px]">{t("colFieldAllowance")}</th>
              <th className="px-4 py-3 min-w-[120px]">Overtime</th>
              <th className="px-4 py-3 min-w-[130px]">{t("colCompensation")}</th>
              <th className="px-4 py-3 min-w-[120px]">THR Allowance</th>
              <th className="px-4 py-3 min-w-[150px]">Annual Bonus Allowance</th>
              <th className="px-4 py-3 min-w-[180px]">Annual Medical Reimbursement</th>
              <th className="px-4 py-3 min-w-[170px]">Laptop Ownership Program</th>
              <th className="px-4 py-3 min-w-[110px]">Training</th>
              <th className="px-4 py-3 min-w-[120px]">Refreshment</th>
              <th className="px-4 py-3 min-w-[160px]">{t("colBpjsHealthCompany")}</th>
              <th className="px-4 py-3 min-w-[150px]">JKK</th>
              <th className="px-4 py-3 min-w-[150px]">JKM</th>
              <th className="px-4 py-3 min-w-[150px]">JHT (Company)</th>
              <th className="px-4 py-3 min-w-[150px]">JKP</th>
              <th className="px-4 py-3 min-w-[150px]">JP (Company)</th>
              <th className="px-4 py-3 min-w-[160px]">{t("colBpjsHealthEmployee")}</th>
              <th className="px-4 py-3 min-w-[150px]">JHT (Employee)</th>
              <th className="px-4 py-3 min-w-[150px]">JP (Employee)</th>
              <th className="px-4 py-3 min-w-[130px]">Total COGS</th>
              <th className="px-4 py-3 min-w-[130px]">Management Fee</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                <td className="px-4 py-3 sticky left-0 bg-white z-10">
                  <div className="flex gap-2 items-center">
                    <Link href={`/tm/${a.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteTalentAssignmentButton assignmentId={a.id} />
                  </div>
                </td>
                <td className="px-4 py-3 sticky left-[100px] bg-white z-10 font-mono text-xs text-slate-500">{a.employee_no ?? "-"}</td>
                <td className="px-4 py-3 sticky left-[230px] bg-white z-10 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <Avatar name={a.candidate_name ?? "-"} size="sm" />
                    <Link href={`/tm/employee/${a.employee_id}`} className="text-brand-600 hover:underline">{a.candidate_name ?? "-"}</Link>
                    <NewBadge createdAt={a.created_at} />
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.opty_no ?? "-"}</td>
                <td className="px-4 py-3 sticky left-[380px] bg-white z-10 text-slate-600 border-r border-slate-200">{a.client_name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{a.position_name ?? "-"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.pq_no ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{formatDdMmYyyy(a.start_date)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDdMmYyyy(a.end_date)}</td>
                <td className={`px-4 py-3 text-slate-600 ${!VALID_STATUS.has(a.status_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>
                  {VALID_STATUS.has(a.status_code ?? "") ? (
                    <Pill variant={STATUS_VARIANTS[a.status_code ?? ""]}>{prettify(a.status_code)}</Pill>
                  ) : (
                    prettify(a.status_code)
                  )}
                </td>
                <td className={`px-4 py-3 text-slate-600 ${!VALID_TRACKS.has(a.talent_track_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>{prettify(a.talent_track_code)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDdMmYyyy(a.increment_date)}</td>
                <td className={`px-4 py-3 text-slate-600 ${!VALID_GRADINGS.has(a.current_grading ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>{a.current_grading ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{a.current_salary_grade_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{a.price_amount ? `Rp ${a.price_amount.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{a.current_skill ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{a.current_certification ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{a.performance_appraisal_result ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{a.performance_review_result ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{a.people_summarize ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{a.increment_amount_deal ? `Rp ${a.increment_amount_deal.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{a.increment_percent_deal !== null ? `${a.increment_percent_deal}%` : "-"}</td>
                <td className={`px-4 py-3 text-slate-600 ${!VALID_STATUS_ALL_DATA.has(a.status_all_data_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>
                  {VALID_STATUS_ALL_DATA.has(a.status_all_data_code ?? "") ? (
                    <Pill variant={STATUS_ALL_DATA_VARIANTS[a.status_all_data_code ?? ""]}>{prettify(a.status_all_data_code)}</Pill>
                  ) : (
                    prettify(a.status_all_data_code)
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{a.notes ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.tax_bruto_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.take_home_pay_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.gross_salary_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.basic_salary_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.functional_allowance_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.transport_allowance_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.project_allowance_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.accommodation_allowance_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.field_allowance_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.overtime_allowance_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.kompensasi_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.thr_allowance_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.annual_bonus_allowance_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.annual_medical_reimbursement_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.laptop_ownership_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.training_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.refreshment_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.bpjs_kesehatan_company_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.jkk_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.jkm_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.jht_company_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.jkp_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.jp_company_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.bpjs_kesehatan_employee_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.jht_employee_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.jp_employee_amount)}</td>
                <td className="px-4 py-3 text-red-600 font-medium">{formatMoney(a.total_cogs_amount)}</td>
                <td className="px-4 py-3 text-slate-600">{formatMoney(a.management_fee_amount)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={52} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
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
            {paginated.map((a) => (
              <GridCard key={a.id} accent={STATUS_ACCENT[a.status_code ?? ""] ?? "violet"}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={a.candidate_name ?? "-"} />
                    <div>
                      <div className="flex items-center gap-2">
                        <Link href={`/tm/employee/${a.employee_id}`} className="font-semibold text-slate-900 hover:text-brand-600 hover:underline">
                          {a.candidate_name ?? "-"}
                        </Link>
                        <NewBadge createdAt={a.created_at} />
                      </div>
                      <div className="text-xs text-slate-400 font-mono">{a.employee_no ?? "-"}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <Link href={`/tm/${a.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteTalentAssignmentButton assignmentId={a.id} />
                  </div>
                </div>
                <div className="mt-auto space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between gap-2"><span className="text-slate-400">Positions</span><span className="text-right">{a.position_name ?? "-"}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-400">Client</span><span className="text-right">{a.client_name ?? "-"}</span></div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Status</span>
                    <span className={`text-right ${!VALID_STATUS.has(a.status_code ?? "") ? "bg-amber-50 text-amber-700 font-medium px-1 rounded" : ""}`}>
                      {VALID_STATUS.has(a.status_code ?? "") ? (
                        <Pill variant={STATUS_VARIANTS[a.status_code ?? ""]}>{prettify(a.status_code)}</Pill>
                      ) : (
                        prettify(a.status_code)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Grading</span>
                    <span className={`text-right ${!VALID_GRADINGS.has(a.current_grading ?? "") ? "bg-amber-50 text-amber-700 font-medium px-1 rounded" : ""}`}>{a.current_grading ?? "-"}</span>
                  </div>
                  <div className="flex justify-between gap-2"><span className="text-slate-400">Price</span><span className="text-right">{a.price_amount ? `Rp ${a.price_amount.toLocaleString("id-ID")}` : "-"}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-400">Total COGS</span><span className="text-right text-red-600 font-medium">{formatMoney(a.total_cogs_amount)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-slate-400">Start - End</span><span className="text-right">{formatDdMmYyyy(a.start_date)} &mdash; {formatDdMmYyyy(a.end_date)}</span></div>
                  {a.notes && <div className="pt-1 border-t border-slate-100 text-slate-500 truncate" title={a.notes}>{a.notes}</div>}
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
