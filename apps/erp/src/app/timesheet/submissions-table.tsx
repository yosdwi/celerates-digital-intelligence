"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { SortableTh } from "@/components/sortable-th";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { Pill } from "@/components/pill";
import { Avatar } from "@/components/avatar";
import { GridCard } from "@/components/grid-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { Field } from "@/components/form-fields";
import type { AttachmentWithUrl } from "@/lib/attachments";
import { createTimesheetSubmission } from "./actions";
import { ApproveSubmissionButton } from "./approve-submission-button";
import { DeleteSubmissionButton } from "./delete-submission-button";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";

type SubmissionRow = {
  id: string;
  user_id: string;
  client_name: string;
  talent_label: string;
  period_start: string;
  period_end: string;
  status_code: string | null;
  approved_at: Date | null;
  approved_by_name: string | null;
  created_at: Date;
  attachments: AttachmentWithUrl[];
};

function StatusPill({ code }: { code: string | null }) {
  const t = useTranslations("timesheet");
  if (code === "approved") return <Pill variant="success">{t("statusApproved")}</Pill>;
  return <Pill variant="warning">{t("statusReview")}</Pill>;
}

export function SubmissionsTable({ data, isPmoFull, currentUserId }: { data: SubmissionRow[]; isPmoFull: boolean; currentUserId: string }) {
  const t = useTranslations("timesheet");
  const { query, setQuery, filtered, paginated, page, setPage, totalPages, pageSize, resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

  function canManage(row: SubmissionRow) {
    return isPmoFull || row.user_id === currentUserId;
  }

  return (
    <div>
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <AddRecordModal buttonLabel={t("submitTimesheet")} title={t("submitTimesheetModalTitle")} action={createTimesheetSubmission}>
          <div className="sm:col-span-3">
            <Field label={t("clientNameLabel")} name="client_name" placeholder={t("clientNamePlaceholder")} required />
          </div>
          <Field label={t("periodStartLabel")} name="period_start" type="date" required />
          <Field label={t("periodEndLabel")} name="period_end" type="date" required />
          <div />
          <div className="sm:col-span-3">
            <MultiFileUpload name="signed_file" label={t("signedFileLabel")} />
          </div>
        </AddRecordModal>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={t("searchTalentClientPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-sm w-full max-w-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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

        <span className="text-xs text-slate-400 ml-auto">{t("filteredOfTotal", { filtered: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "table" && (
        <>
          <div className="overflow-auto max-h-[420px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20">
                <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
                  <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[100px]">{t("actions")}</th>
                  {isPmoFull && <th className="px-4 py-3 sticky left-[100px] bg-violet-50 z-10 min-w-[160px] border-r border-slate-200">{t("talent")}</th>}
                  <SortableTh
                    label={t("client")}
                    sortKey="client_name"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={toggleSort}
                    className="px-4 py-3 min-w-[200px]"
                  />
                  <SortableTh
                    label={t("periodStartLabel")}
                    sortKey="period_start"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={toggleSort}
                    className="px-4 py-3 min-w-[110px]"
                  />
                  <SortableTh
                    label={t("periodEndLabel")}
                    sortKey="period_end"
                    activeSortKey={sortKey}
                    direction={sortDirection}
                    onSort={toggleSort}
                    className="px-4 py-3 min-w-[110px]"
                  />
                  <th className="px-4 py-3 min-w-[100px]">{t("status")}</th>
                  <th className="px-4 py-3 min-w-[140px]">{t("approvedBy")}</th>
                  <th className="px-4 py-3 min-w-[90px]">{t("file")}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                    <td className="px-4 py-3 sticky left-0 bg-white z-0">
                      <div className="flex gap-2 items-center">
                        {isPmoFull && s.status_code !== "approved" && <ApproveSubmissionButton submissionId={s.id} />}
                        {isPmoFull && <span className="text-slate-300">|</span>}
                        {canManage(s) && <DeleteSubmissionButton submissionId={s.id} />}
                      </div>
                    </td>
                    {isPmoFull && (
                      <td className="px-4 py-3 sticky left-[100px] bg-white z-0 font-medium text-slate-900 border-r border-slate-200">
                        <div className="flex items-center gap-2">
                          <Avatar name={s.talent_label} size="sm" />
                          {s.talent_label}
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-600">{s.client_name}</td>
                    <td className="px-4 py-3 text-slate-600">{s.period_start}</td>
                    <td className="px-4 py-3 text-slate-600">{s.period_end}</td>
                    <td className="px-4 py-3"><StatusPill code={s.status_code} /></td>
                    <td className="px-4 py-3 text-slate-600">{s.approved_by_name ?? "-"}</td>
                    <td className="px-4 py-3">
                      {s.attachments.length > 0 ? (
                        <a href={s.attachments[0].url ?? "#"} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">{t("view")}</a>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={isPmoFull ? 8 : 7} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
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
            {paginated.map((s) => (
              <GridCard key={s.id} accent={s.status_code === "approved" ? "emerald" : "amber"}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-2 items-center">
                    {isPmoFull && s.status_code !== "approved" && <ApproveSubmissionButton submissionId={s.id} />}
                    {isPmoFull && <span className="text-slate-300">|</span>}
                    {canManage(s) && <DeleteSubmissionButton submissionId={s.id} />}
                  </div>
                  <StatusPill code={s.status_code} />
                </div>
                <div className="flex items-center gap-2.5">
                  <Avatar name={isPmoFull ? s.talent_label : s.client_name} />
                  <p className="text-base font-semibold text-slate-900">{isPmoFull ? s.talent_label : s.client_name}</p>
                </div>
                <p className="text-xs text-slate-400 mb-3">{isPmoFull ? s.client_name : ""}</p>
                <div className="mt-auto space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">{t("period")}</span><span className="text-slate-600">{s.period_start} - {s.period_end}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">{t("approvedBy")}</span><span className="text-slate-600">{s.approved_by_name ?? "-"}</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t("file")}</span>
                    {s.attachments.length > 0 ? (
                      <a href={s.attachments[0].url ?? "#"} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{t("view")}</a>
                    ) : <span className="text-slate-300">-</span>}
                  </div>
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
