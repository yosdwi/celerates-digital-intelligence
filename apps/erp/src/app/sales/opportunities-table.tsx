"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useTableFilter } from "@/hooks/use-table-filter";
import { StageBadge } from "./stage-badge";
import { StageSelector } from "./stage-selector";
import { DeleteOpportunityButton } from "./delete-opportunity-button";
import { SmartFileLink } from "@/components/smart-file-link";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { NewBadge } from "@/components/new-badge";
import { Avatar } from "@/components/avatar";
import { GridCard, type CardAccent } from "@/components/grid-card";
import { Pill } from "@/components/pill";
import type { AttachmentWithUrl } from "@/lib/attachments";
import type { SignerOption } from "@/lib/approval-journey";
import { PqSignatureStatus, type PqSignatureInfo } from "./pq-signature-status";
import { SortableTh } from "@/components/sortable-th";
import { Paperclip, Link as LinkIcon, Search, SlidersHorizontal, RotateCcw } from "lucide-react";

const PRICE_PERIOD_LABELS: Record<string, string> = {
  monthly: "/bulan", project: "/project", yearly: "/tahun", daily: "/hari",
};

const LEAD_SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn", ads: "Ads", referral: "Referral", existing: "Existing", website: "Website",
};


type Opportunity = {
  id: string;
  opty_no: string;
  pq_no: string | null;
  onboarding_request_id: string | null;
  client_name: string;
  client_type_code: string | null;
  project_name: string;
  position_name: string | null;
  service_type_code: string;
  business_unit_code: string | null;
  level_code: string | null;
  headcount_target: number | null;
  estimated_duration_months: number | null;
  priority_code: string | null;
  bant_score: number | null;
  price_amount: number | null;
  price_period_code: string | null;
  approval_date: string | null;
  po_doc_url: string | null;
  sales_pic_name: string;
  pipeline_stage_code: string;
  opty_status_code: string | null;
  opty_request_date: string | null;
  notes: string | null;
  lead_source_code: string | null;
  created_at: Date | string | null;
  poDocAttachments: AttachmentWithUrl[];
  pqDocAttachments: AttachmentWithUrl[];
  pqSignature: PqSignatureInfo;
};

const PIPELINE_ACCENT: Record<string, CardAccent> = { win: "emerald", drop: "rose", hold: "amber", on_going: "violet" };

const BUSINESS_UNITS = [["tm", "TM"], ["cs", "CS"], ["solution", "SOLUTION"], ["other", "Other"]] as const;
const PRIORITIES = [["p0", "P0"], ["p1", "P1"], ["p2", "P2"], ["p3", "P3"]] as const;
const CLIENT_TYPES = [["existing", "Existing"], ["new", "New"]] as const;
const PIPELINE_STAGES = [["win", "Win"], ["drop", "Drop"], ["hold", "Hold"], ["on_going", "On Going"]] as const;

export function OpportunitiesTable({
  data,
  clients,
  userOptions,
}: {
  data: Opportunity[];
  clients: { id: string; name: string; code: string }[];
  userOptions: SignerOption[];
}) {
  const t = useTranslations("sales.pqTracker");
  const tc = useTranslations("common");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

  const filters = [
    { key: "pipeline_stage_code", label: "Pipeline Stage", options: PIPELINE_STAGES },
    { key: "business_unit_code", label: "Business Unit", options: BUSINESS_UNITS },
    { key: "priority_code", label: "Priority", options: PRIORITIES },
    { key: "client_type_code", label: "Client Type", options: CLIENT_TYPES },
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

        <span className="text-xs text-slate-400 ml-auto">{t("ofCount", { filtered: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "table" && (
      <>
      {/* max-h + overflow-auto eksplisit -- tanpa ini, browser mempromosikan
          overflow-x-auto jadi scroll container 2 arah tanpa tinggi tetap, dan
          `sticky` di <thead> jadi nempel ke div ini (yang ikut discroll bareng
          halaman) alih-alih benar-benar diam di layar. */}
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          {/* Header freeze (sticky top) + 4 kolom pertama freeze (sticky left,
              offset kumulatif) -- pola sama persis dengan tabel Talent
              Assignments di /tm (lihat talent-assignments-table.tsx). */}
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[180px]">{t("actionStatus")}</th>
              <th className="px-4 py-3 sticky left-[180px] bg-violet-50 z-10 min-w-[160px]">Opty No</th>
              <th className="px-4 py-3 sticky left-[340px] bg-violet-50 z-10 min-w-[190px]">PQ No</th>
              <th className="px-4 py-3 sticky left-[530px] bg-violet-50 z-10 min-w-[170px] border-r border-slate-200">{t("pqDocumentCol")}</th>
              <th className="px-4 py-3 min-w-[160px]">{t("pqSignatureCol")}</th>
              <SortableTh
                label={t("clientCol")}
                sortKey="client_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[130px]"
              />
              <th className="px-4 py-3 min-w-[100px]">Client Type</th>
              <th className="px-4 py-3 min-w-[130px]">Project</th>
              <th className="px-4 py-3 min-w-[130px]">Positions</th>
              <th className="px-4 py-3 min-w-[110px]">Service Type</th>
              <th className="px-4 py-3 min-w-[90px]">BU</th>
              <th className="px-4 py-3 min-w-[100px]">Level</th>
              <th className="px-4 py-3 min-w-[90px]">Headcount</th>
              <th className="px-4 py-3 min-w-[100px]">Durasi</th>
              <th className="px-4 py-3 min-w-[80px]">Priority</th>
              <th className="px-4 py-3 min-w-[80px]">BANTE</th>
              <SortableTh
                label={t("priceCol")}
                sortKey="price_amount"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[140px]"
              />
              <th className="px-4 py-3 min-w-[120px]">Approval Date</th>
              <th className="px-4 py-3 min-w-[100px]">PO Doc</th>
              <th className="px-4 py-3 min-w-[130px]">Sales PIC</th>
              <th className="px-4 py-3 min-w-[110px]">Lead Source</th>
              <SortableTh
                label="Opty Request Date"
                sortKey="opty_request_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[130px]"
              />
              <th className="px-4 py-3 min-w-[200px]">{t("notesCol")}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((opty) => renderOpportunityRow(opty))}
            {filtered.length === 0 && (
              <tr><td colSpan={23} className="px-6 py-10 text-center text-slate-400">{t("noMatch")}</td></tr>
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
            {paginated.map((opty) => renderOpportunityCard(opty))}
          </div>
          <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
        </>
      )}
    </div>
  );

  function renderOpportunityCard(opty: Opportunity) {
    return (
      <GridCard key={opty.id} accent={PIPELINE_ACCENT[opty.pipeline_stage_code] ?? "violet"}>
        <div className="flex items-start justify-between gap-2 mt-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar name={opty.client_name} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 truncate">{opty.client_name} <NewBadge createdAt={opty.created_at} /></p>
              <p className="text-xs font-mono text-slate-400">{opty.opty_no}</p>
            </div>
          </div>
          <StageBadge pipelineStageCode={opty.pipeline_stage_code} />
        </div>
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2"><span className="text-slate-400">Project</span><span className="text-slate-700 text-right">{opty.project_name}</span></div>
          <div className="flex justify-between gap-2"><span className="text-slate-400">Positions</span><span className="text-slate-700 text-right">{opty.position_name ?? "-"}</span></div>
          <div className="flex justify-between gap-2"><span className="text-slate-400">Sales PIC</span><span className="text-slate-700 text-right">{opty.sales_pic_name}</span></div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">{t("priceCol")}</span>
            <span className="text-slate-700 text-right">
              {opty.price_amount ? `Rp ${opty.price_amount.toLocaleString("id-ID")}${PRICE_PERIOD_LABELS[opty.price_period_code ?? ""] ?? ""}` : "-"}
            </span>
          </div>
        </div>
        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center gap-2">
          <Link href={`/sales/${opty.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
          <span className="text-slate-300">|</span>
          <DeleteOpportunityButton opportunityId={opty.id} />
        </div>
      </GridCard>
    );
  }

  function renderOpportunityRow(opty: Opportunity) {
    return (
              <tr key={opty.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                <td className="px-4 py-3 sticky left-0 bg-white z-0 space-y-1.5">
                <div className="flex gap-2 items-center">
                  <Link href={`/sales/${opty.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                  <span className="text-slate-300">|</span>
                  <DeleteOpportunityButton opportunityId={opty.id} />
                </div>
                {!opty.pq_no && opty.onboarding_request_id && (
                  <span className="w-fit"><Pill variant="warning">{t("statNeedGeneratePq")}</Pill></span>
                )}
                {!opty.pq_no && !opty.onboarding_request_id && (
                  <span className="text-xs text-slate-400 block">{t("waitingTalentOnboard")}</span>
                )}
                  <StageBadge pipelineStageCode={opty.pipeline_stage_code} />
                  <StageSelector id={opty.id} currentPipelineStage={opty.pipeline_stage_code} currentOptyStatus={opty.opty_status_code} />
                </td>
                <td className="px-4 py-3 sticky left-[180px] bg-white z-0 font-mono text-xs text-slate-500">{opty.opty_no}</td>
                <td className="px-4 py-3 sticky left-[340px] bg-white z-0 font-mono text-xs text-slate-500">{opty.pq_no ?? "-"}</td>
                <td className="px-4 py-3 sticky left-[530px] bg-white z-0 space-y-1 border-r border-slate-200">
                  {opty.pqDocAttachments.length === 0 ? (
                    <span className="text-slate-300">-</span>
                  ) : (
                    opty.pqDocAttachments.map((a) => (
                      <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                        {a.kind === "link" ? <LinkIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />} {a.file_name}
                      </a>
                    ))
                  )}
                </td>
                <td className="px-4 py-3">
                  <PqSignatureStatus opportunityId={opty.id} info={opty.pqSignature} userOptions={userOptions} existingDocs={opty.pqDocAttachments} pqNo={opty.pq_no} />
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={opty.client_name} size="sm" />
                    <span className="flex items-center gap-1.5">{opty.client_name} <NewBadge createdAt={opty.created_at} /></span>
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{opty.client_type_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{opty.project_name}</td>
                <td className="px-4 py-3 text-slate-600">{opty.position_name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{opty.service_type_code}</td>
                <td className="px-4 py-3 text-slate-600 uppercase">{opty.business_unit_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{opty.level_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{opty.headcount_target ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{opty.estimated_duration_months ? `${opty.estimated_duration_months} bulan` : "-"}</td>
                <td className="px-4 py-3 text-slate-600 uppercase">{opty.priority_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{opty.bant_score ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">
                {opty.price_amount ? `Rp ${opty.price_amount.toLocaleString("id-ID")}${PRICE_PERIOD_LABELS[opty.price_period_code ?? ""] ?? ""}` : "-"}
                </td>
                <td className="px-4 py-3 text-slate-600">{opty.approval_date ?? "-"}</td>
                <td className="px-4 py-3 space-y-1">
                  {opty.po_doc_url && <SmartFileLink value={opty.po_doc_url} />}
                  {opty.poDocAttachments.map((a) => (
                    <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                      {a.kind === "link" ? <LinkIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />} {a.file_name}
                    </a>
                  ))}
                  {!opty.po_doc_url && opty.poDocAttachments.length === 0 && "-"}
                </td>
                <td className="px-4 py-3 text-slate-600">{opty.sales_pic_name}</td>
                <td className="px-4 py-3 text-slate-600">{opty.lead_source_code ? LEAD_SOURCE_LABELS[opty.lead_source_code] ?? opty.lead_source_code : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{opty.opty_request_date ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={opty.notes ?? ""}>{opty.notes ?? "-"}</td>
              </tr>
    );
  }
}