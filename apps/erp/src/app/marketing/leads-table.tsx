"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { StatusBadge } from "./status-badge";
import { ConvertButton } from "./convert-button";
import { DeleteLeadButton } from "./delete-lead-button";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { NewBadge } from "@/components/new-badge";
import { Avatar } from "@/components/avatar";
import { GridCard, type CardAccent } from "@/components/grid-card";
import { Pill } from "@/components/pill";
import { SortableTh } from "@/components/sortable-th";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";

type Lead = {
  id: string;
  lead_no: string;
  client_name: string;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  company_size: number | null;
  industry_code: string | null;
  service_type_code: string;
  lead_source_code: string;
  category_code: string;
  sales_pic_name: string;
  is_qualified: boolean | null;
  project_name: string | null;
  price_amount: number | null;
  price_period_code: string | null;
  notes: string | null;
  disqualify_reason: string | null;
  created_at: Date;
};

const SERVICE_TYPES = [
  ["outsourcing", "Outsourcing"], ["headhunting", "Headhunting"], ["outplacement", "Outplacement"],
  ["managed_service", "Managed Service"], ["project_based", "Project Based"], ["rpo", "RPO"],
  ["training", "Training"], ["license", "License"], ["hardware", "Hardware"],
  ["corporate_training", "Corporate Training"], ["software_development", "Software Development"],
] as const;
const CATEGORIES = [["it", "IT"], ["non_it", "Non-IT"]] as const;

// Nilai resmi sesuai dropdown ERP -- di luar ini dianggap "belum standar",
// biasanya hasil import dari sumber lama yang istilahnya beda.
const VALID_SERVICE_TYPES = new Set(["outsourcing", "headhunting", "outplacement", "managed_service", "project_based", "rpo", "training", "license", "hardware", "corporate_training", "software_development"]);
const VALID_LEAD_SOURCES = new Set(["linkedin", "ads", "referral", "existing", "website"]);
const VALID_CATEGORIES = new Set(["it", "non_it"]);

function leadAccent(lead: Lead): CardAccent {
  if (lead.is_qualified === true) return "emerald";
  if (lead.is_qualified === false) return "rose";
  return "violet";
}

export function LeadsTable({ data, convertedLeadIds }: { data: Lead[]; convertedLeadIds: string[] }) {
  const t = useTranslations("marketing");
  const tc = useTranslations("common");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const convertedSet = new Set(convertedLeadIds);
  const [view, setView] = useState<TableView>("table");

  const PRICE_PERIOD_LABELS: Record<string, string> = {
    monthly: t("perMonthSuffix"), project: "/project", yearly: t("perYearSuffix"), daily: t("perDaySuffix"),
  };

  const QUALIFICATION_STATUS = [
    ["null", t("notDecided")], ["true", "Qualified"], ["false", "Disqualified"],
  ] as const;

  const filters = [
    { key: "service_type_code", label: "Service Type", options: SERVICE_TYPES },
    { key: "category_code", label: t("category"), options: CATEGORIES },
    { key: "is_qualified", label: t("qualification"), options: QUALIFICATION_STATUS },
  ];

  return (
    <div>
      <div className="px-6 py-3.5 border-b border-slate-100 bg-white/60 backdrop-blur-xl flex flex-wrap items-center gap-2.5">
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

        <span className="text-xs text-slate-400 ml-auto">{t("filteredOfTotal", { filtered: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="px-6 pt-3 text-xs text-amber-600">
        🟡 {t("yellowCellHint")}
      </div>

      {view === "table" && (
      <>
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 space-y-1.5 min-w-[170px]">{t("action")}</th>
              <SortableTh
                label="Lead No"
                sortKey="lead_no"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[170px] bg-violet-50 z-10 min-w-[160px]"
              />
              <SortableTh
                label={t("client")}
                sortKey="client_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[330px] bg-violet-50 z-10 min-w-[130px]"
              />
              <th className="px-4 py-3 sticky left-[460px] bg-violet-50 z-10 min-w-[130px] border-r border-slate-200">{t("contact")}</th>
              <th className="px-4 py-3 min-w-[110px]">Phone</th>
              <th className="px-4 py-3 min-w-[160px]">Email</th>
              <th className="px-4 py-3 min-w-[110px]">Company Size</th>
              <th className="px-4 py-3 min-w-[110px]">Industry</th>
              <th className="px-4 py-3 min-w-[110px]">Lead Source</th>
              <th className="px-4 py-3 min-w-[110px]">Service Type</th>
              <th className="px-4 py-3 min-w-[100px]">Category</th>
              <th className="px-4 py-3 min-w-[130px]">Sales PIC</th>
              <th className="px-4 py-3 min-w-[130px]">Project</th>
              <SortableTh
                label={t("price")}
                sortKey="price_amount"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[130px]"
              />
              <th className="px-4 py-3 min-w-[120px]">{t("qualification")}</th>
              <th className="px-4 py-3 min-w-[180px]">{t("notes")}</th>
              <th className="px-4 py-3 min-w-[180px]">{t("disqualifyReason")}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((lead) => {
              const isConverted = convertedSet.has(lead.id);
              const canConvert = lead.is_qualified === true && !isConverted;
              return (
                <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                  <td className="px-4 py-3 sticky left-0 bg-white z-0 space-y-1.5 min-w-[170px]">
                    <div className="flex gap-2 items-center">
                      <Link href={`/marketing/${lead.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                      <span className="text-slate-300">|</span>
                      <DeleteLeadButton leadId={lead.id} />
                    </div>
                    {canConvert && <ConvertButton leadId={lead.id} />}
                    {isConverted && <Pill variant="success">{t("alreadyConverted")}</Pill>}
                  </td>
                  <td className="px-4 py-3 sticky left-[170px] bg-white z-0 font-mono text-xs text-slate-500">{lead.lead_no}</td>
                  <td className="px-4 py-3 sticky left-[330px] bg-white z-0 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <Avatar name={lead.client_name} size="sm" />
                      <span className="flex items-center gap-1.5">{lead.client_name} <NewBadge createdAt={lead.created_at} /></span>
                    </div>
                  </td>
                  <td className="px-4 py-3 sticky left-[460px] bg-white z-0 text-slate-600 border-r border-slate-200">{lead.contact_name}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.contact_phone ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.contact_email ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.company_size ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.industry_code ?? "-"}</td>
                  <td className={`px-4 py-3 text-slate-600 ${!VALID_LEAD_SOURCES.has(lead.lead_source_code) ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>
                    {lead.lead_source_code}
                  </td>
                  <td className={`px-4 py-3 text-slate-600 ${!VALID_SERVICE_TYPES.has(lead.service_type_code) ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>
                    {lead.service_type_code}
                  </td>
                  <td className={`px-4 py-3 text-slate-600 ${!VALID_CATEGORIES.has(lead.category_code) ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>
                    {lead.category_code}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{lead.sales_pic_name}</td>
                  <td className="px-4 py-3 text-slate-600">{lead.project_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {lead.price_amount ? `Rp ${lead.price_amount.toLocaleString("id-ID")}${PRICE_PERIOD_LABELS[lead.price_period_code ?? ""] ?? ""}` : "-"}
                  </td>
                  <td className="px-4 py-3"><StatusBadge isQualified={lead.is_qualified} /></td>
                  <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={lead.notes ?? ""}>{lead.notes ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={lead.disqualify_reason ?? ""}>{lead.disqualify_reason ?? "-"}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={16} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
      </>
      )}

      {view === "grid" && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {paginated.map((lead) => {
              const isConverted = convertedSet.has(lead.id);
              const canConvert = lead.is_qualified === true && !isConverted;
              return (
                <GridCard key={lead.id} accent={leadAccent(lead)}>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={lead.client_name} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="text-base font-semibold text-slate-900 truncate">{lead.client_name}</div>
                        <NewBadge createdAt={lead.created_at} />
                      </div>
                      <div className="text-xs font-mono text-slate-400">{lead.lead_no}</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("contact")}</span>
                      <span className="text-slate-600 text-right">{lead.contact_name}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Sales PIC</span>
                      <span className="text-slate-600 text-right">{lead.sales_pic_name}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("price")}</span>
                      <span className="text-slate-600 text-right">
                        {lead.price_amount ? `Rp ${lead.price_amount.toLocaleString("id-ID")}${PRICE_PERIOD_LABELS[lead.price_period_code ?? ""] ?? ""}` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 items-center">
                      <span className="text-slate-400">{t("qualification")}</span>
                      <StatusBadge isQualified={lead.is_qualified} />
                    </div>
                  </div>

                  <div className="mt-auto pt-3 border-t border-slate-100 flex gap-2 items-center flex-wrap">
                    <Link href={`/marketing/${lead.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteLeadButton leadId={lead.id} />
                    {canConvert && <ConvertButton leadId={lead.id} />}
                    {isConverted && <Pill variant="success">{t("alreadyConverted")}</Pill>}
                  </div>
                </GridCard>
              );
            })}
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