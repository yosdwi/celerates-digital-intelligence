"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { DeleteEmployeeButton } from "./delete-employee-button";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { NewBadge } from "@/components/new-badge";
import { Pill } from "@/components/pill";
import { Avatar } from "@/components/avatar";
import { GridCard, type CardAccent } from "@/components/grid-card";
import { SortableTh } from "@/components/sortable-th";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";

type Employee = {
  id: string;
  employee_no: string;
  candidate_no: string | null;
  candidate_name: string | null;
  position_name: string | null;
  job_level_code: string | null;
  employee_category_code: string | null;
  company_email: string | null;
  join_date: string | null;
  gender_code: string | null;
  religion_code: string | null;
  marital_status_changed_date: string | null;
  ptkp_code: string | null;
  ptkp_effective_year: number | null;
  notes: string | null;
  created_at: Date | null;
  docsIncomplete: boolean;
};

const CATEGORIES = [["backoffice", "Backoffice"], ["talent", "Talent"], ["freelance", "Freelance"]] as const;
const JOB_LEVELS = [["internship", "Internship"], ["staff", "Staff"], ["manager", "Manager"], ["head", "Head"], ["chief", "Chief"]] as const;

const VALID_CATEGORIES = new Set(["backoffice", "talent", "freelance"]);
const VALID_JOB_LEVELS = new Set(["internship", "staff", "manager", "head", "chief"]);

function employeeAccent(e: Employee): CardAccent {
  return e.docsIncomplete ? "amber" : "violet";
}

export function EmployeesTable({ data }: { data: Employee[] }) {
  const t = useTranslations("hr.table");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

  const filters = [
    { key: "employee_category_code", label: t("filterType"), options: CATEGORIES },
    { key: "job_level_code", label: t("filterJobLevel"), options: JOB_LEVELS },
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
                <option value="">{t("filterAll", { label: f.label })}</option>
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

        <span className="text-xs text-slate-400 ml-auto">{t("countOfTotal", { count: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="px-6 pt-3 text-xs text-amber-600">
        {t("importWarning")}
      </div>

      {view === "table" && (
      <>
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[100px]">{t("colAction")}</th>
              <th className="px-4 py-3 sticky left-[100px] bg-violet-50 z-10 min-w-[150px]">{t("colEmployeeNo")}</th>
              <th className="px-4 py-3 sticky left-[250px] bg-violet-50 z-10 min-w-[120px]">{t("colCandidateId")}</th>
              <SortableTh
                label={t("colName")}
                sortKey="candidate_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[370px] bg-violet-50 z-10 min-w-[150px] border-r border-slate-200"
              />
              <SortableTh
                label={t("colPositions")}
                sortKey="position_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[130px]"
              />
              <th className="px-4 py-3 min-w-[100px]">{t("colJobLevel")}</th>
              <th className="px-4 py-3 min-w-[100px]">{t("colType")}</th>
              <th className="px-4 py-3 min-w-[180px]">{t("colEmail")}</th>
              <SortableTh
                label={t("colJoinDate")}
                sortKey="join_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <th className="px-4 py-3 min-w-[110px]">{t("colGender")}</th>
              <th className="px-4 py-3 min-w-[100px]">{t("colReligion")}</th>
              <th className="px-4 py-3 min-w-[160px]">{t("colMaritalStatusChangeDate")}</th>
              <th className="px-4 py-3 min-w-[100px]">{t("colPtkp")}</th>
              <th className="px-4 py-3 min-w-[130px]">{t("colPtkpYear")}</th>
              <th className="px-4 py-3 min-w-[180px]">{t("colNotes")}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                <td className="px-4 py-3 sticky left-0 bg-white z-0">
                  <div className="flex gap-2 items-center">
                    <Link href={`/hr/${e.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{t("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteEmployeeButton employeeId={e.id} />
                  </div>
                </td>
                <td className="px-4 py-3 sticky left-[100px] bg-white z-0 font-mono text-xs text-slate-500">{e.employee_no}</td>
                <td className="px-4 py-3 sticky left-[250px] bg-white z-0 font-mono text-xs text-slate-500">{e.candidate_no ?? "-"}</td>
                <td className="px-4 py-3 sticky left-[370px] bg-white z-0 font-medium text-slate-900 border-r border-slate-200">
                  <div className="flex flex-col gap-0.5">
                    {e.docsIncomplete && <Pill variant="warning">{t("completeDocuments")}</Pill>}
                    <div className="flex items-center gap-2">
                      <Avatar name={e.candidate_name ?? "-"} size="sm" />
                      <Link href={`/hr/${e.id}`} className="text-brand-600 hover:underline">{e.candidate_name ?? "-"}</Link>
                      <NewBadge createdAt={e.created_at} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{e.position_name ?? "-"}</td>
                <td className={`px-4 py-3 text-slate-600 ${!VALID_JOB_LEVELS.has(e.job_level_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>{e.job_level_code ?? "-"}</td>
                <td className={`px-4 py-3 text-slate-600 ${!VALID_CATEGORIES.has(e.employee_category_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>{e.employee_category_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{e.company_email ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{e.join_date ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{e.gender_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{e.religion_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{e.marital_status_changed_date ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{e.ptkp_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{e.ptkp_effective_year ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{e.notes ?? "-"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={14} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
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
          {paginated.map((e) => (
            <GridCard key={e.id} accent={employeeAccent(e)}>
              <div className="flex items-start gap-2.5">
                <Avatar name={e.candidate_name ?? "-"} />
                <div className="flex flex-col gap-0.5 min-w-0">
                  {e.docsIncomplete && <Pill variant="warning">{t("completeDocuments")}</Pill>}
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <Link href={`/hr/${e.id}`} className="hover:underline">{e.candidate_name ?? "-"}</Link>
                    <NewBadge createdAt={e.created_at} />
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-400 font-mono mb-3">{e.employee_no}</div>
              <div className="space-y-1 text-xs text-slate-600">
                <div><span className="text-slate-400">{t("colPositions")}:</span> {e.position_name ?? "-"}</div>
                <div><span className="text-slate-400">{t("colJobLevel")}:</span> {e.job_level_code ?? "-"}</div>
                <div><span className="text-slate-400">{t("colType")}:</span> {e.employee_category_code ?? "-"}</div>
                <div><span className="text-slate-400">{t("colEmail")}:</span> {e.company_email ?? "-"}</div>
                <div><span className="text-slate-400">{t("colJoinDate")}:</span> {e.join_date ?? "-"}</div>
              </div>
              <div className="flex gap-2 items-center mt-auto pt-3 border-t border-slate-100">
                <Link href={`/hr/${e.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{t("edit")}</Link>
                <span className="text-slate-300">|</span>
                <DeleteEmployeeButton employeeId={e.id} />
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