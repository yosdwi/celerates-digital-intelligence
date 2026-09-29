"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { PaginationControls } from "@/components/pagination-controls";
import { StatusPanel } from "./status-panel";
import { DeleteFeatureRequestButton } from "./delete-feature-request-button";
import { MODULE_AREAS, MODULE_AREA_LABELS, REQUEST_TYPES, REQUEST_TYPE_LABELS, PRIORITIES, PRIORITY_LABELS, PRIORITY_STYLES, STATUSES } from "./constants";
import type { AttachmentWithUrl } from "@/lib/attachments";
import { Paperclip, Link as LinkIcon, Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { SortableTh } from "@/components/sortable-th";

type FeatureRequestRow = {
  id: string;
  request_no: string;
  context_path: string | null;
  release_sha: string | null;
  environment: string | null;
  acceptance_criteria: string | null;
  backlog_url: string | null;
  delivered_release: string | null;
  validation_notes: string | null;

  title: string;
  module_area_code: string | null;
  request_type_code: string;
  priority_code: string;
  status_code: string;
  description: string;
  current_behavior: string | null;
  expected_behavior: string | null;
  business_impact: string | null;
  requested_by_user_id: string | null;
  requested_by_name: string;
  requested_by_email: string | null;
  target_date: string | null;
  assigned_to_name: string | null;
  resolution_notes: string | null;
  created_at: Date;
  attachments: AttachmentWithUrl[];
};

export function FeatureRequestsTable({
  data,
  isOwner,
  currentUserId,
}: {
  data: FeatureRequestRow[];
  isOwner: boolean;
  currentUserId?: string;
}) {
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const t = useTranslations("featureRequests");
  const tc = useTranslations("common");

  const filters = [
    { key: "status_code", label: "Status", options: STATUSES },
    { key: "priority_code", label: "Priority", options: PRIORITIES },
    { key: "module_area_code", label: t("filterModule"), options: MODULE_AREAS },
    { key: "request_type_code", label: t("filterType"), options: REQUEST_TYPES },
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
                <option value="">{f.label}: {t("filterAllLabel")}</option>
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

        <span className="text-xs text-slate-400 ml-auto">{t("resultsCount", { filtered: filtered.length, total: data.length })}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-0 min-w-[100px]">{t("actionHeader")}</th>
              <th className="px-4 py-3 min-w-[110px]">{t("requestNoHeader")}</th>
              <SortableTh
                label={t("titleHeader")}
                sortKey="title"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[180px]"
              />
              <th className="px-4 py-3 min-w-[130px]">{t("filterModule")}</th>
              <th className="px-4 py-3 min-w-[100px]">{t("filterType")}</th>
              <SortableTh
                label="Priority"
                sortKey="priority_code"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[90px]"
              />
              <th className="px-4 py-3 min-w-[200px]">Status</th>
              <th className="px-4 py-3 min-w-[280px]">{t("descriptionHeader")}</th>
              <th className="px-4 py-3 min-w-[220px]">{t("conditionHeader")}</th>
              <th className="px-4 py-3 min-w-[180px]">{t("businessImpactHeader")}</th>
              <th className="px-4 py-3 min-w-[130px]">Requester</th>
              <th className="px-4 py-3 min-w-[110px]">{t("targetDateHeader")}</th>
              <SortableTh
                label={t("submittedHeader")}
                sortKey="created_at"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <th className="px-4 py-3 min-w-[180px]">{t("attachmentsHeader")}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((r) => {
              const canDelete = isOwner || (r.requested_by_user_id === currentUserId && r.status_code === "new");
              return (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                  <td className="px-4 py-3 sticky left-0 bg-white z-0">
                    <div className="flex flex-col gap-1 items-start">
                      <Link href={`/feature-requests/${r.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                      {canDelete && <DeleteFeatureRequestButton requestId={r.id} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.request_no}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{r.title}<p className="text-xs text-slate-500 font-normal">{r.context_path || "/"} · {r.environment} · {r.release_sha?.slice(0, 8)}</p></td>
                  <td className="px-4 py-3 text-slate-600">{r.module_area_code ? MODULE_AREA_LABELS[r.module_area_code] ?? r.module_area_code : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{REQUEST_TYPE_LABELS[r.request_type_code] ?? r.request_type_code}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full whitespace-nowrap px-2.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[r.priority_code] ?? "bg-slate-100 text-slate-600"}`}>
                      {PRIORITY_LABELS[r.priority_code] ?? r.priority_code}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPanel review={r}
                      requestId={r.id}
                      statusCode={r.status_code}
                      assignedToName={r.assigned_to_name}
                      resolutionNotes={r.resolution_notes}
                      isOwner={isOwner}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[280px]"><p className="line-clamp-3">{r.description}</p></td>
                  <td className="px-4 py-3 text-slate-600 max-w-[220px] text-xs space-y-1">
                    {r.current_behavior && <p><span className="text-slate-400">{t("currentLabel")}</span> {r.current_behavior}</p>}
                    {r.expected_behavior && <p><span className="text-slate-400">{t("expectedLabel")}</span> {r.expected_behavior}</p>}
                    {!r.current_behavior && !r.expected_behavior && "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[180px]"><p className="line-clamp-3">{r.business_impact ?? "-"}</p></td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="flex items-center gap-2">
                      <Avatar name={r.requested_by_name} size="sm" />
                      <div className="min-w-0">
                        {r.requested_by_name}
                        {r.requested_by_email && <span className="block text-[11px] text-slate-400">{r.requested_by_email}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.target_date ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.created_at.toLocaleDateString("id-ID")}</td>
                  <td className="px-4 py-3">
                    {r.attachments.length === 0 ? (
                      <span className="text-slate-300">-</span>
                    ) : (
                      <ul className="space-y-1">
                        {r.attachments.map((a) => (
                          <li key={a.id}>
                            <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                              {a.kind === "link" ? <LinkIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />} {a.file_name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={14} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
            )}
          </tbody>
        </table>
        <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
      </div>
    </div>
  );
}
