"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useTableFilter } from "@/hooks/use-table-filter";
import { DeleteInvoiceButton } from "./delete-invoice-button";
import { FinanceHandoffPanel } from "./finance-handoff-panel";
import { SmartFileLink } from "@/components/smart-file-link";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import type { AttachmentWithUrl } from "@/lib/attachments";
import { Paperclip, Link as LinkIcon, Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { SortableTh } from "@/components/sortable-th";
import { formatMonthNameYear, formatDdMonthNameYyyy } from "@/lib/month-format";
import { INVOICE_ISSUE_LABELS } from "../constants";
import { Pill, type PillVariant } from "@/components/pill";
import { NewBadge } from "@/components/new-badge";
import { Avatar } from "@/components/avatar";
import { GridCard, type CardAccent } from "@/components/grid-card";

type ProjectInvoice = {
  id: string;
  opportunity_id: string;
  opty_no: string | null;
  client_name: string | null;
  business_unit_code: string | null;
  invoice_plan_date: string | null;
  group_name: string | null;
  services_month_start: string | null;
  price_per_month: number | null;
  status_code: string | null;
  bast_support_doc_url: string | null;
  notes: string | null;
  finance_doc_url: string | null;
  finance_status_code: string | null;
  finance_notified_at: Date | null;
  finance_notified_by_name: string | null;
  finance_received_at: Date | null;
  finance_received_by_name: string | null;
  finance_notes: string | null;
  bastAttachments: AttachmentWithUrl[];
  issue_code: string | null;
  submit_bast_date: string | null;
  created_at: Date | null;
};

function formatDdMmYyyy(dateStr: string | null): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

const STATUS_OPTIONS = [["submitted", "Submitted"], ["overdue", "Overdue"], ["planned", "Planned"]] as const;
const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS);
const STATUS_VARIANTS: Record<string, PillVariant> = {
  submitted: "success",
  overdue: "critical",
  planned: "info",
};

const STATUS_ACCENT: Record<string, CardAccent> = {
  submitted: "emerald",
  overdue: "rose",
  planned: "amber",
};

const ISSUE_VARIANTS: Record<string, PillVariant> = {
  bast_on_progress_internal: "info",
  bast_menunggu_ttd: "warning",
  done_to_finance: "success",
  menunggu_cr: "warning",
  menunggu_po: "warning",
  menunggu_po_cr: "warning",
  menunggu_timesheet: "warning",
  periode_belum_selesai: "neutral",
};

function InvoiceStatusPill({ code }: { code: string | null }) {
  if (!code) return <>-</>;
  const variant = STATUS_VARIANTS[code] ?? "neutral";
  return <Pill variant={variant}>{STATUS_LABELS[code] ?? code}</Pill>;
}

function InvoiceIssuePill({ code }: { code: string | null }) {
  if (!code) return <>-</>;
  const variant = ISSUE_VARIANTS[code] ?? "neutral";
  return <Pill variant={variant}>{INVOICE_ISSUE_LABELS[code] ?? code}</Pill>;
}

export function InvoicesTable({ data }: { data: ProjectInvoice[] }) {
  const t = useTranslations("pmo.invoices");
  const tc = useTranslations("common");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

  // Filter Client HARUS pakai client_name (selalu konsisten, ditarik live dari
  // opportunity yang sama) -- BUKAN group_name (teks bebas, bisa diedit manual
  // per-invoice, jadi 2 invoice client yang sama bisa punya group_name beda
  // dikit dan nggak ke-match walau harusnya satu grup). Ini yang bikin filter
  // sebelumnya cuma nampilin 1 baris padahal clientnya sama di banyak invoice.
  const clientOptions = Array.from(new Set(data.map((d) => d.client_name).filter((v): v is string => !!v))).sort()
    .map((v) => [v, v] as const);
  const monthOptions = Array.from(new Set(data.map((d) => d.services_month_start).filter((v): v is string => !!v))).sort()
    .map((v) => [v, formatMonthNameYear(v)] as const);

  const filters = [
    { key: "client_name", label: "Client", options: clientOptions },
    { key: "services_month_start", label: "Bulan", options: monthOptions },
    { key: "status_code", label: "Status", options: STATUS_OPTIONS },
  ];

  // Begitu Client di-filter, urutan default (end date kontrak) jadi kurang
  // berguna -- lebih enak diurut kronologis per bulan biar kelihatan progres
  // invoice-nya dari awal ke terbaru. Filter lain (Bulan/Status/search) tetap
  // ikut urutan default.
  const isClientFiltered = !!activeFilters.client_name;
  const sortedFiltered = isClientFiltered
    ? [...filtered].sort((a, b) => (a.services_month_start ?? "").localeCompare(b.services_month_start ?? ""))
    : filtered;
  const filteredTotal = sortedFiltered.reduce((sum, d) => sum + (d.price_per_month ?? 0), 0);
  const displayRows = isClientFiltered ? sortedFiltered.slice((page - 1) * pageSize, page * pageSize) : paginated;

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

        <span className="text-xs text-slate-400 ml-auto">{t("countOfTotal", { filtered: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {isClientFiltered && (
        <div className="px-6 py-2.5 border-b border-violet-100 bg-violet-50/50 flex items-center gap-2 text-xs text-violet-800">
          <span className="font-semibold">{activeFilters.client_name}</span>
          <span>&middot;</span>
          <span>{sortedFiltered.length} invoice{sortedFiltered.length !== 1 ? "s" : ""}</span>
          <span>&middot;</span>
          <span>Total Rp {filteredTotal.toLocaleString("id-ID")}/bulan</span>
        </div>
      )}

      {view === "table" && (
      <>
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[100px]">{t("colAction")}</th>
              <th className="px-4 py-3 sticky left-[100px] bg-violet-50 z-10 min-w-[190px]">{t("colFinanceDoc")}</th>
              <th className="px-4 py-3 sticky left-[290px] bg-violet-50 z-10 min-w-[110px]">Status</th>
              <th className="px-4 py-3 sticky left-[400px] bg-violet-50 z-10 min-w-[90px] border-r border-slate-200">BU</th>
              <SortableTh
                label="Invoice Plan Date"
                sortKey="invoice_plan_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[130px]"
              />
              <th className="px-4 py-3 min-w-[110px]">{t("colGroup")}</th>
              <th className="px-4 py-3 min-w-[130px]">ID Opty</th>
              <SortableTh
                label="Client"
                sortKey="client_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[130px]"
              />
              <th className="px-4 py-3 min-w-[140px]">Services Month</th>
              <SortableTh
                label="Price / Month"
                sortKey="price_per_month"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[140px]"
              />
              <th className="px-4 py-3 min-w-[170px]">Issue</th>
              <th className="px-4 py-3 min-w-[130px]">Submit BAST Date</th>
              <th className="px-4 py-3 min-w-[140px]">BAST & Support</th>
              <th className="px-4 py-3 min-w-[180px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((inv) => (
              <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                <td className="px-4 py-3 sticky left-0 bg-white z-0">
                  <div className="flex gap-2 items-center">
                    <Link href={`/pmo/invoices/${inv.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteInvoiceButton invoiceId={inv.id} />
                  </div>
                </td>
                <td className="px-4 py-3 sticky left-[100px] bg-white z-0">
                  <FinanceHandoffPanel
                    opportunityId={inv.opportunity_id}
                    invoiceId={inv.id}
                    docUrl={inv.finance_doc_url}
                    statusCode={inv.finance_status_code ?? "pending"}
                    notifiedByName={inv.finance_notified_by_name}
                    notifiedAt={inv.finance_notified_at ? new Date(inv.finance_notified_at).toLocaleDateString("id-ID") : null}
                    receivedByName={inv.finance_received_by_name}
                    receivedAt={inv.finance_received_at ? new Date(inv.finance_received_at).toLocaleDateString("id-ID") : null}
                    financeNotes={inv.finance_notes}
                  />
                </td>
                <td className="px-4 py-3 sticky left-[290px] bg-white z-0 text-slate-600"><InvoiceStatusPill code={inv.status_code} /></td>
                <td className="px-4 py-3 sticky left-[400px] bg-white z-0 text-slate-600 uppercase border-r border-slate-200">{inv.business_unit_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{formatDdMonthNameYyyy(inv.invoice_plan_date)}</td>
                <td className="px-4 py-3 text-slate-600">{inv.group_name ?? "-"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{inv.opty_no ?? "-"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <Avatar name={inv.client_name ?? "-"} size="sm" />
                    {inv.client_name ?? "-"}
                    <NewBadge createdAt={inv.created_at} />
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{formatMonthNameYear(inv.services_month_start)}</td>
                <td className="px-4 py-3 text-slate-600">{inv.price_per_month ? `Rp ${inv.price_per_month.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600"><InvoiceIssuePill code={inv.issue_code} /></td>
                <td className="px-4 py-3 text-slate-600">{formatDdMmYyyy(inv.submit_bast_date)}</td>
                <td className="px-4 py-3">
                  <SmartFileLink value={inv.bast_support_doc_url} />
                  {inv.bastAttachments.length > 0 && (
                    <ul className="space-y-1 mt-1">
                      {inv.bastAttachments.map((a) => (
                        <li key={a.id}>
                          <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                            {a.kind === "link" ? <LinkIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />} {a.file_name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{inv.notes ?? "-"}</td>
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
            {displayRows.map((inv) => (
              <GridCard key={inv.id} accent={STATUS_ACCENT[inv.status_code ?? ""] ?? "blue"}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-2 items-center">
                    <Link href={`/pmo/invoices/${inv.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteInvoiceButton invoiceId={inv.id} />
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <Avatar name={inv.client_name ?? "-"} />
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      {inv.client_name ?? "-"}
                      <NewBadge createdAt={inv.created_at} />
                    </p>
                    <p className="text-xs font-mono text-slate-400">{inv.opty_no ?? "-"}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between items-center"><span className="text-slate-400">Status</span><InvoiceStatusPill code={inv.status_code} /></div>
                  <div className="flex justify-between"><span className="text-slate-400">Price / Month</span><span className="text-slate-600">{inv.price_per_month ? `Rp ${inv.price_per_month.toLocaleString("id-ID")}` : "-"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Services Month</span><span className="text-slate-600">{formatMonthNameYear(inv.services_month_start)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">{t("colGroup")}</span><span className="text-slate-600">{inv.group_name ?? "-"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">BU</span><span className="text-slate-600 uppercase">{inv.business_unit_code ?? "-"}</span></div>
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