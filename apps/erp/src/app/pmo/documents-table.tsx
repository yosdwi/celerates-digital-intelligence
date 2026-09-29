"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { DeleteDocumentButton } from "./delete-document-button";
import { SmartFileLink } from "@/components/smart-file-link";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import type { AttachmentWithUrl } from "@/lib/attachments";
import { Paperclip, Link as LinkIcon, Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Pill, type PillVariant } from "@/components/pill";
import { NewBadge } from "@/components/new-badge";
import { Avatar } from "@/components/avatar";
import { GridCard } from "@/components/grid-card";
import { SortableTh } from "@/components/sortable-th";

type ProjectDocument = {
  id: string;
  opty_no: string | null;
  client_name: string | null;
  position_name: string | null;
  sales_pic_name: string | null;
  project_details: string | null;
  pq_price: number | null;
  pq_total: number | null;
  pks_no: string | null;
  pks_url: string | null;
  pks_status_code: string | null;
  po_no: string | null;
  po_url: string | null;
  po_status_code: string | null;
  po_start_date: string | null;
  po_end_date: string | null;
  cr_no: string | null;
  cr_url: string | null;
  cr_status_code: string | null;
  other_doc_no: string | null;
  other_doc_url: string | null;
  other_doc_status_code: string | null;
  pksAttachments: AttachmentWithUrl[];
  poAttachments: AttachmentWithUrl[];
  crAttachments: AttachmentWithUrl[];
  otherAttachments: AttachmentWithUrl[];
  created_at: Date | null;
};

function AttachmentList({ items }: { items: AttachmentWithUrl[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1 mt-1">
      {items.map((a) => (
        <li key={a.id}>
          <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
            {a.kind === "link" ? <LinkIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />} {a.file_name}
          </a>
        </li>
      ))}
    </ul>
  );
}

const STATUS_OPTIONS = [["draft", "Draft"], ["in_review", "In Review"], ["signed", "Signed"], ["expired", "Expired"]] as const;
const VALID_DOC_STATUS = new Set(["done_softcopy", "done_hardcopy", "on_progress", "need_fu_hardcopy", "need_fu_softcopy", "none"]);

function DocStatusCell({ code }: { code: string | null }) {
  const t = useTranslations("pmo");
  const value = code ?? "";
  const DOC_STATUS_META: Record<string, { label: string; variant: PillVariant }> = {
    done_softcopy: { label: t("docStatus.doneSoftcopy"), variant: "success" },
    done_hardcopy: { label: t("docStatus.doneHardcopy"), variant: "success" },
    on_progress: { label: t("docStatus.onProgress"), variant: "info" },
    need_fu_hardcopy: { label: t("docStatus.needFuHardcopy"), variant: "warning" },
    need_fu_softcopy: { label: t("docStatus.needFuSoftcopy"), variant: "warning" },
    none: { label: t("docStatus.none"), variant: "neutral" },
  };
  if (!VALID_DOC_STATUS.has(value)) {
    return <Pill variant="warning">{code ?? "-"}</Pill>;
  }
  const meta = DOC_STATUS_META[value];
  return <Pill variant={meta.variant}>{meta.label}</Pill>;
}

export function DocumentsTable({ data }: { data: ProjectDocument[] }) {
  const t = useTranslations("pmo");
  const tc = useTranslations("common");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

  const filters = [
    { key: "pks_status_code", label: t("statusPks"), options: STATUS_OPTIONS },
    { key: "po_status_code", label: t("statusPo"), options: STATUS_OPTIONS },
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

        <span className="text-xs text-slate-400 ml-auto">{t("filteredCount", { filtered: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="px-6 pt-3 text-xs text-amber-600">
        {t("yellowCellHint")}
      </div>

      {view === "table" && (
      <>
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[100px]">{t("headers.action")}</th>
              <SortableTh
                label={t("headers.optyId")}
                sortKey="opty_no"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[100px] bg-violet-50 z-10 min-w-[130px]"
              />
              <SortableTh
                label="Client"
                sortKey="client_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[230px] bg-violet-50 z-10 min-w-[130px]"
              />
              <th className="px-4 py-3 sticky left-[360px] bg-violet-50 z-10 min-w-[130px] border-r border-slate-200">Positions</th>
              <th className="px-4 py-3 min-w-[130px]">Sales PIC</th>
              <th className="px-4 py-3 min-w-[200px]">Project Details</th>
              <th className="px-4 py-3 min-w-[140px]">PQ Price</th>
              <th className="px-4 py-3 min-w-[140px]">PQ Total</th>
              <SortableTh
                label={t("headers.noPks")}
                sortKey="pks_no"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <th className="px-4 py-3 min-w-[90px]">{t("headers.linkPks")}</th>
              <th className="px-4 py-3 min-w-[100px]">{t("statusPks")}</th>
              <th className="px-4 py-3 min-w-[110px]">{t("headers.noPo")}</th>
              <th className="px-4 py-3 min-w-[90px]">{t("headers.linkPo")}</th>
              <th className="px-4 py-3 min-w-[100px]">{t("statusPo")}</th>
              <th className="px-4 py-3 min-w-[120px]">Start Date PO</th>
              <th className="px-4 py-3 min-w-[120px]">End Date PO</th>
              <th className="px-4 py-3 min-w-[110px]">{t("headers.noCr")}</th>
              <th className="px-4 py-3 min-w-[90px]">{t("headers.linkCr")}</th>
              <th className="px-4 py-3 min-w-[100px]">{t("headers.statusCr")}</th>
              <th className="px-4 py-3 min-w-[120px]">{t("headers.noOtherDoc")}</th>
              <th className="px-4 py-3 min-w-[90px]">{t("headers.linkOtherDoc")}</th>
              <th className="px-4 py-3 min-w-[120px]">{t("headers.statusOtherDoc")}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                <td className="px-4 py-3 sticky left-0 bg-white z-0">
                  <div className="flex gap-2 items-center">
                    <Link href={`/pmo/${d.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteDocumentButton documentId={d.id} />
                  </div>
                </td>
                <td className="px-4 py-3 sticky left-[100px] bg-white z-0 font-mono text-xs text-slate-500">{d.opty_no ?? "-"}</td>
                <td className="px-4 py-3 sticky left-[230px] bg-white z-0 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <Avatar name={d.client_name ?? "-"} size="sm" />
                    {d.client_name ?? "-"}
                    <NewBadge createdAt={d.created_at} />
                  </div>
                </td>
                <td className="px-4 py-3 sticky left-[360px] bg-white z-0 text-slate-600 border-r border-slate-200">{d.position_name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{d.sales_pic_name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={d.project_details ?? ""}>{d.project_details ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{d.pq_price ? `Rp ${d.pq_price.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{d.pq_total ? `Rp ${d.pq_total.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{d.pks_no ?? "-"}</td>
                <td className="px-4 py-3">
                  <SmartFileLink value={d.pks_url} />
                  <AttachmentList items={d.pksAttachments} />
                </td>
                <td className="px-4 py-3 text-slate-600"><DocStatusCell code={d.pks_status_code} /></td>
                <td className="px-4 py-3 text-slate-600">{d.po_no ?? "-"}</td>
                <td className="px-4 py-3">
                  <SmartFileLink value={d.po_url} />
                  <AttachmentList items={d.poAttachments} />
                </td>
                <td className="px-4 py-3 text-slate-600"><DocStatusCell code={d.po_status_code} /></td>
                <td className="px-4 py-3 text-slate-600">{d.po_start_date ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{d.po_end_date ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{d.cr_no ?? "-"}</td>
                <td className="px-4 py-3">
                  <SmartFileLink value={d.cr_url} />
                  <AttachmentList items={d.crAttachments} />
                </td>
                <td className="px-4 py-3 text-slate-600"><DocStatusCell code={d.cr_status_code} /></td>
                <td className="px-4 py-3 text-slate-600">{d.other_doc_no ?? "-"}</td>
                <td className="px-4 py-3">
                  <SmartFileLink value={d.other_doc_url} />
                  <AttachmentList items={d.otherAttachments} />
                </td>
                <td className="px-4 py-3 text-slate-600"><DocStatusCell code={d.other_doc_status_code} /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={21} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
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
            {paginated.map((d) => (
              <GridCard key={d.id} accent="blue">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-2 items-center">
                    <Link href={`/pmo/${d.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteDocumentButton documentId={d.id} />
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <Avatar name={d.client_name ?? "-"} />
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      {d.client_name ?? "-"}
                      <NewBadge createdAt={d.created_at} />
                    </p>
                    <p className="text-xs font-mono text-slate-400">{d.opty_no ?? "-"}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Positions</span><span className="text-slate-600">{d.position_name ?? "-"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">PQ Price</span><span className="text-slate-600">{d.pq_price ? `Rp ${d.pq_price.toLocaleString("id-ID")}` : "-"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">PQ Total</span><span className="text-slate-600">{d.pq_total ? `Rp ${d.pq_total.toLocaleString("id-ID")}` : "-"}</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t("statusPks")}</span>
                    <DocStatusCell code={d.pks_status_code} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t("statusPo")}</span>
                    <DocStatusCell code={d.po_status_code} />
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