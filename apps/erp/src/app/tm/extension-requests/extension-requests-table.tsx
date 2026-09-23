"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { DeleteExtensionRequestButton } from "./delete-extension-request-button";
import { ApprovalJourney, type JourneyStep } from "./approval-journey";
import { EditExtensionRequestModal } from "./edit-extension-request-modal";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { Pill } from "@/components/pill";
import { Avatar } from "@/components/avatar";
import { GridCard, type CardAccent } from "@/components/grid-card";
import type { SignerOption } from "@/lib/approval-journey";
import type { AttachmentWithUrl } from "@/lib/attachments";
import { SortableTh } from "@/components/sortable-th";
import { Paperclip, StickyNote, Search, SlidersHorizontal, RotateCcw } from "lucide-react";

type ExtensionRequest = {
  id: string;
  employee_no: string | null;
  candidate_name: string | null;
  pq_tracker_id: string | null;
  pq_opty_no: string | null;
  propose_start_date: string | null;
  propose_end_date: string | null;
  proposed_position_name: string | null;
  proposed_grade_level_code: string | null;
  proposed_employment_type_code: string | null;
  proposed_basic_salary_amount: number | null;
  proposed_transport_allowance_amount: number | null;
  proposed_project_allowance_amount: number | null;
  proposed_accommodation_allowance_amount: number | null;
  proposed_overtime_allowance_amount: number | null;
  proposed_increment_amount_deal: number | null;
  proposed_increment_percent_deal: number | null;
  requester_name: string;
  requester_user_id: string | null;
  approver_1_user_id: string | null;
  approver_2_user_id: string | null;
  approver_3_user_id: string | null;
  acknowledger_user_id: string | null;
  status_code: string;
  hr_status_code: string;
  owner_override: boolean;
  owner_override_by_name: string | null;
  notes: string | null;
  journeySteps: JourneyStep[];
  attachments: AttachmentWithUrl[];
  specialNotesTotal: number;
  specialNotesOpen: number;
};

const STATUS_OPTIONS = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]] as const;

const STATUS_ACCENT: Record<string, CardAccent> = { approved: "emerald", pending: "amber", rejected: "rose" };

export function ExtensionRequestsTable({ data, isOwner, userOptions }: { data: ExtensionRequest[]; isOwner: boolean; userOptions: SignerOption[] }) {
  const t = useTranslations("tm.extensionRequests");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

  const filters = [{ key: "status_code", label: "Status", options: STATUS_OPTIONS }];

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

      {view === "table" && (
      <>
      {/* max-h + overflow-auto eksplisit -- lihat opportunities-table.tsx: tanpa
          ini `sticky` di <thead> tidak akan diam di layar saat scroll 2 arah. */}
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[100px]">{t("colAction")}</th>
              <th className="px-4 py-3 sticky left-[100px] bg-violet-50 z-10 min-w-[240px]">Approval Journey</th>
              <th className="px-4 py-3 sticky left-[340px] bg-violet-50 z-10 min-w-[110px]">Status HR</th>
              <th className="px-4 py-3 sticky left-[450px] bg-violet-50 z-10 min-w-[130px] border-r border-slate-200">Employee No</th>
              <SortableTh
                label={t("colName")}
                sortKey="candidate_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[150px]"
              />
              <SortableTh
                label="Propose Start"
                sortKey="propose_start_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <SortableTh
                label="Propose End"
                sortKey="propose_end_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <th className="px-4 py-3 min-w-[130px]">Positions (Propose)</th>
              <th className="px-4 py-3 min-w-[110px]">Grade (Propose)</th>
              <th className="px-4 py-3 min-w-[130px]">{t("employmentStatusPropose")}</th>
              <th className="px-4 py-3 min-w-[130px]">Basic Salary (Propose)</th>
              <th className="px-4 py-3 min-w-[130px]">Total Gross (Propose)</th>
              <th className="px-4 py-3 min-w-[150px]">Increment Deal (Propose)</th>
              <th className="px-4 py-3 min-w-[130px]">Requester</th>
              <th className="px-4 py-3 min-w-[180px]">{t("colDocuments")}</th>
              <th className="px-4 py-3 min-w-[180px]">Notes</th>
              <th className="px-4 py-3 min-w-[150px]">{t("colSpecialNotes")} (TM&harr;HR)</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((r) => {
              const proposeGross =
                (r.proposed_basic_salary_amount ?? 0) +
                (r.proposed_transport_allowance_amount ?? 0) +
                (r.proposed_project_allowance_amount ?? 0) +
                (r.proposed_accommodation_allowance_amount ?? 0) +
                (r.proposed_overtime_allowance_amount ?? 0);
              return (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                  <td className="px-4 py-3 sticky left-0 bg-white z-0 space-y-1">
                    {r.status_code === "pending" && <EditExtensionRequestModal request={r} userOptions={userOptions} />}
                    <DeleteExtensionRequestButton requestId={r.id} />
                  </td>
                  <td className="px-4 py-3 sticky left-[100px] bg-white z-0">
                    <ApprovalJourney
                      requestId={r.id}
                      steps={r.journeySteps}
                      statusCode={r.status_code}
                      ownerOverride={r.owner_override}
                      ownerOverrideByName={r.owner_override_by_name}
                      isOwner={isOwner}
                    />
                  </td>
                  <td className="px-4 py-3 sticky left-[340px] bg-white z-0">
                    {r.status_code !== "approved" ? (
                      <span className="text-xs text-slate-400">-</span>
                    ) : r.hr_status_code === "processed" ? (
                      <Pill variant="success">Processed</Pill>
                    ) : (
                      <Pill variant="warning">Waiting HR</Pill>
                    )}
                  </td>
                  <td className="px-4 py-3 sticky left-[450px] bg-white z-0 font-mono text-xs text-slate-500 border-r border-slate-200">{r.employee_no ?? "-"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <Avatar name={r.candidate_name ?? "-"} size="sm" />
                      {r.candidate_name ?? "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.propose_start_date ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.propose_end_date ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.proposed_position_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.proposed_grade_level_code ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.proposed_employment_type_code ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.proposed_basic_salary_amount ? `Rp ${r.proposed_basic_salary_amount.toLocaleString("id-ID")}` : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{proposeGross > 0 ? `Rp ${proposeGross.toLocaleString("id-ID")}` : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.proposed_increment_amount_deal ? `Rp ${r.proposed_increment_amount_deal.toLocaleString("id-ID")}` : "-"}
                    {r.proposed_increment_percent_deal ? ` (${r.proposed_increment_percent_deal}%)` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.requester_name}
                    {r.pq_opty_no && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700" title="Dibuat dari Sales, ke-link ke PQ Tracker">
                        PQ: {r.pq_opty_no}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.attachments.length === 0 ? (
                      <span className="text-slate-300">-</span>
                    ) : (
                      <ul className="space-y-1">
                        {r.attachments.map((a) => (
                          <li key={a.id}>
                            <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                              <Paperclip className="h-3 w-3 shrink-0" /> {a.file_name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.notes ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href="/tm/special-notes"
                      className={`inline-flex items-center gap-1.5 rounded-full whitespace-nowrap px-2.5 py-1 text-xs font-medium border ${
                        r.specialNotesOpen > 0
                          ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                          : "text-slate-400 border-slate-200 hover:bg-violet-50/60"
                      }`}
                    >
                      <StickyNote className="h-3.5 w-3.5" />
                      {r.specialNotesTotal > 0 ? `${r.specialNotesOpen} open / ${r.specialNotesTotal}` : t("addLink")}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={17} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
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
            {paginated.map((r) => {
              const proposeGross =
                (r.proposed_basic_salary_amount ?? 0) +
                (r.proposed_transport_allowance_amount ?? 0) +
                (r.proposed_project_allowance_amount ?? 0) +
                (r.proposed_accommodation_allowance_amount ?? 0) +
                (r.proposed_overtime_allowance_amount ?? 0);
              return (
                <GridCard key={r.id} accent={STATUS_ACCENT[r.status_code] ?? "violet"}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.candidate_name ?? "-"} />
                      <div>
                        <div className="font-semibold text-slate-900">{r.candidate_name ?? "-"}</div>
                        <div className="text-xs text-slate-400 font-mono">{r.employee_no ?? "-"}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center shrink-0">
                      {r.status_code === "pending" && <EditExtensionRequestModal request={r} userOptions={userOptions} />}
                      <DeleteExtensionRequestButton requestId={r.id} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <ApprovalJourney
                      requestId={r.id}
                      steps={r.journeySteps}
                      statusCode={r.status_code}
                      ownerOverride={r.owner_override}
                      ownerOverrideByName={r.owner_override_by_name}
                      isOwner={isOwner}
                    />
                  </div>
                  <div className="mt-auto space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Status HR</span>
                      <span className="text-right">
                        {r.status_code !== "approved" ? (
                          <span className="text-slate-400">-</span>
                        ) : r.hr_status_code === "processed" ? (
                          <Pill variant="success">Processed</Pill>
                        ) : (
                          <Pill variant="warning">Waiting HR</Pill>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2"><span className="text-slate-400">Positions</span><span className="text-right">{r.proposed_position_name ?? "-"}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-400">{t("period")}</span><span className="text-right">{r.propose_start_date ?? "-"} &mdash; {r.propose_end_date ?? "-"}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-400">Basic Salary</span><span className="text-right">{r.proposed_basic_salary_amount ? `Rp ${r.proposed_basic_salary_amount.toLocaleString("id-ID")}` : "-"}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-400">Total Gross</span><span className="text-right">{proposeGross > 0 ? `Rp ${proposeGross.toLocaleString("id-ID")}` : "-"}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-400">Requester</span><span className="text-right">{r.requester_name}{r.pq_opty_no && <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">PQ: {r.pq_opty_no}</span>}</span></div>
                    <div className="flex justify-between gap-2 items-center">
                      <span className="text-slate-400">{t("colSpecialNotes")}</span>
                      <Link
                        href="/tm/special-notes"
                        className={`inline-flex items-center gap-1.5 rounded-full whitespace-nowrap px-2.5 py-1 text-xs font-medium border ${
                          r.specialNotesOpen > 0
                            ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                            : "text-slate-400 border-slate-200 hover:bg-violet-50/60"
                        }`}
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                        {r.specialNotesTotal > 0 ? `${r.specialNotesOpen} open / ${r.specialNotesTotal}` : t("addLink")}
                      </Link>
                    </div>
                    {r.notes && <div className="pt-1 border-t border-slate-100 text-slate-500 truncate" title={r.notes}>{r.notes}</div>}
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