"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useTableFilter } from "@/hooks/use-table-filter";
import { HiringStatusBadge } from "./hiring-status-badge";
import { HiringStatusSelector } from "./hiring-status-selector";
import { DeleteApplicationButton } from "./delete-application-button";
import { ConvertToOnboardingLink } from "./convert-to-onboarding-link";
import { SmartFileLink } from "@/components/smart-file-link";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { Avatar } from "@/components/avatar";
import { GridCard, pickAccent } from "@/components/grid-card";
import { SortableTh } from "@/components/sortable-th";
import type { AttachmentWithUrl } from "@/lib/attachments";
import { Paperclip, Link as LinkIcon, Megaphone, Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { CLIENT_SUBMISSION_LABELS } from "../client-active/constants";

type ApplicationRow = {
  id: string;
  application_date: string;
  level_code: string | null;
  ta_pic_name: string;
  candidateCvUrl: string | null;
  cv_celerates_url: string | null;
  cvCeleratesAttachments: AttachmentWithUrl[];
  candidate_source_code: string | null;
  notes: string | null;
  price_amount: number | null;
  hiring_status_code: string;
  requisition_id: string | null;
  candidate_id: string | null;
  client_name: string | null;
  position_name: string | null;
  service_type_code: string | null;
  candidate_no: string | null;
  candidate_name: string | null;
  wa_number: string | null;
  email: string | null;
  current_salary_amount: number | null;
  expected_salary_amount: number | null;
  client_submission_status_code: string | null;
  client_submission_updated_at: Date | null;
  client_submission_updated_by_name: string | null;
  client_submission_note: string | null;
};

const HIRING_STATUS_OPTIONS = [
  ["cv_sent", "CV Sent"], ["hr_interview", "HR Interview"], ["tech_test", "Tech Test"],
  ["user_interview", "User Interview"], ["offering", "Offering"], ["mcu_process", "MCU Process"], ["onboarding", "Onboarding"],
  ["offering_hold", "Offering - Hold"],
  ["reject_cv", "Reject CV"], ["failed_tech_test", "Failed Tech Test"], ["reject_user_interview", "Reject User Interview"],
  ["reject_offering", "Reject Offering"], ["failed_mcu", "Failed MCU"],
  ["withdraw_offering", "Withdraw Offering"], ["withdraw_user_interview", "Withdraw User Interview"],
  ["withdraw_onboarding", "Withdraw Onboarding"], ["withdraw_hr_interview", "Withdraw HR Interview"],
  ["withdraw_tech_test", "Withdraw Tech Test"], ["withdraw_mcu", "Withdraw MCU"],
] as const;

export function ApplicationsTable({ data }: { data: ApplicationRow[] }) {
  const t = useTranslations("ta.pipeline.table");
  const tc = useTranslations("common");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

  const filters = [{ key: "hiring_status_code", label: "Hiring Status", options: HIRING_STATUS_OPTIONS }];

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

        <span className="text-xs text-slate-400 ml-auto">{t("countOf", { shown: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "table" && (
      <>
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[200px]">{t("headers.actionStatus")}</th>
              <SortableTh
                label={t("headers.date")}
                sortKey="application_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[200px] bg-violet-50 z-10 min-w-[110px]"
              />
              <SortableTh
                label={t("headers.client")}
                sortKey="client_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[310px] bg-violet-50 z-10 min-w-[130px]"
              />
              <th className="px-4 py-3 sticky left-[440px] bg-violet-50 z-10 min-w-[120px] border-r border-slate-200">Candidate No</th>
              <SortableTh
                label="Candidate"
                sortKey="candidate_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[130px]"
              />
              <th className="px-4 py-3 min-w-[130px]">Positions</th>
              <th className="px-4 py-3 min-w-[110px]">Service Type</th>
              <th className="px-4 py-3 min-w-[90px]">Level</th>
              <th className="px-4 py-3 min-w-[110px]">WA</th>
              <th className="px-4 py-3 min-w-[150px]">Email</th>
              <th className="px-4 py-3 min-w-[120px]">Current Salary</th>
              <th className="px-4 py-3 min-w-[120px]">Expected Salary</th>
              <th className="px-4 py-3 min-w-[110px]">TA PIC</th>
              <th className="px-4 py-3 min-w-[90px]">{t("headers.originalCv")}</th>
              <th className="px-4 py-3 min-w-[100px]">CV Celerates</th>
              <th className="px-4 py-3 min-w-[130px]">Source</th>
              <th className="px-4 py-3 min-w-[140px]">Price</th>
              <th className="px-4 py-3 min-w-[140px]">{t("headers.marginEstimate")}</th>
              <th className="px-4 py-3 min-w-[180px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((r) => {
              const margin = r.price_amount != null && r.expected_salary_amount != null ? r.price_amount - r.expected_salary_amount : null;
              return (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                  <td className="px-4 py-3 sticky left-0 bg-white z-0 space-y-1">
                    {r.client_submission_status_code && (
                      <div className="flex items-start gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2 py-1.5 text-[11px] text-teal-800">
                        <Megaphone className="h-3.5 w-3.5 shrink-0 mt-0.5 text-teal-600" />
                        <div>
                          <p className="font-medium">
                            {t("salesPrefix")}: {CLIENT_SUBMISSION_LABELS[r.client_submission_status_code] ?? r.client_submission_status_code}
                          </p>
                          {r.client_submission_updated_by_name && (
                            <p className="text-teal-600">
                              {r.client_submission_updated_by_name}
                              {r.client_submission_updated_at ? ` · ${r.client_submission_updated_at.toLocaleDateString("id-ID")}` : ""}
                            </p>
                          )}
                          {r.client_submission_note && <p className="italic text-teal-700 mt-0.5">{r.client_submission_note}</p>}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <Link href={`/ta/pipeline/${r.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                      <span className="text-slate-300">|</span>
                      <DeleteApplicationButton applicationId={r.id} />
                    </div>
                    <HiringStatusSelector id={r.id} currentStatus={r.hiring_status_code} />
                    <HiringStatusBadge hiringStatusCode={r.hiring_status_code} />
                    {r.hiring_status_code === "onboarding" && (
                      <ConvertToOnboardingLink candidateId={r.candidate_id} requisitionId={r.requisition_id} />
                    )}
                  </td>
                  <td className="px-4 py-3 sticky left-[200px] bg-white z-0 text-slate-600">{r.application_date}</td>
                  <td className="px-4 py-3 sticky left-[310px] bg-white z-0 font-medium text-slate-900">{r.client_name ?? "-"}</td>
                  <td className="px-4 py-3 sticky left-[440px] bg-white z-0 font-mono text-xs text-slate-500 border-r border-slate-200">{r.candidate_no ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="flex items-center gap-2">
                      <Avatar name={r.candidate_name ?? "-"} size="sm" />
                      {r.candidate_name ?? "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.position_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.service_type_code ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.level_code ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.wa_number ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.email ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.current_salary_amount ? `Rp ${r.current_salary_amount.toLocaleString("id-ID")}` : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.expected_salary_amount ? `Rp ${r.expected_salary_amount.toLocaleString("id-ID")}` : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.ta_pic_name}</td>
                  <td className="px-4 py-3"><SmartFileLink value={r.candidateCvUrl} label={t("viewLink")} /></td>
                  <td className="px-4 py-3 space-y-1">
                    <SmartFileLink value={r.cv_celerates_url} label={t("viewLink")} />
                    {r.cvCeleratesAttachments.map((a) => (
                      <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                        {a.kind === "link" ? <LinkIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />} {a.file_name}
                      </a>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.candidate_source_code ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.price_amount ? `Rp ${r.price_amount.toLocaleString("id-ID")}` : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{margin != null ? `Rp ${margin.toLocaleString("id-ID")}` : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.notes ?? "-"}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={18} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
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
            {paginated.map((r, idx) => {
              const margin = r.price_amount != null && r.expected_salary_amount != null ? r.price_amount - r.expected_salary_amount : null;
              return (
                <GridCard key={r.id} accent={pickAccent(idx)}>
                  <div className="flex items-start gap-2.5">
                    <Avatar name={r.candidate_name ?? "-"} />
                    <div>
                      <p className="text-base font-semibold text-slate-900">{r.candidate_name ?? "-"}</p>
                      <p className="text-xs font-mono text-slate-400">{r.candidate_no ?? "-"}</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("headers.client")}</span>
                      <span className="text-slate-700 font-medium text-right">{r.client_name ?? "-"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Position</span>
                      <span className="text-slate-700 text-right">{r.position_name ?? "-"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("headers.date")}</span>
                      <span className="text-slate-700 text-right">{r.application_date}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">TA PIC</span>
                      <span className="text-slate-700 text-right">{r.ta_pic_name}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Price</span>
                      <span className="text-slate-700 text-right">{r.price_amount ? `Rp ${r.price_amount.toLocaleString("id-ID")}` : "-"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("headers.marginEstimate")}</span>
                      <span className="text-slate-700 text-right">{margin != null ? `Rp ${margin.toLocaleString("id-ID")}` : "-"}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <HiringStatusBadge hiringStatusCode={r.hiring_status_code} />
                  </div>

                  {r.client_submission_status_code && (
                    <div className="mt-3 flex items-start gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2 py-1.5 text-[11px] text-teal-800">
                      <Megaphone className="h-3.5 w-3.5 shrink-0 mt-0.5 text-teal-600" />
                      <div>
                        <p className="font-medium">
                          {t("salesPrefix")}: {CLIENT_SUBMISSION_LABELS[r.client_submission_status_code] ?? r.client_submission_status_code}
                        </p>
                        {r.client_submission_updated_by_name && (
                          <p className="text-teal-600">
                            {r.client_submission_updated_by_name}
                            {r.client_submission_updated_at ? ` · ${r.client_submission_updated_at.toLocaleDateString("id-ID")}` : ""}
                          </p>
                        )}
                        {r.client_submission_note && <p className="italic text-teal-700 mt-0.5">{r.client_submission_note}</p>}
                      </div>
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-slate-100 space-y-1.5">
                    <HiringStatusSelector id={r.id} currentStatus={r.hiring_status_code} />
                    {r.hiring_status_code === "onboarding" && (
                      <ConvertToOnboardingLink candidateId={r.candidate_id} requisitionId={r.requisition_id} />
                    )}
                    <div className="flex gap-2 items-center">
                      <Link href={`/ta/pipeline/${r.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                      <span className="text-slate-300">|</span>
                      <DeleteApplicationButton applicationId={r.id} />
                    </div>
                  </div>
                </GridCard>
              );
            })}
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