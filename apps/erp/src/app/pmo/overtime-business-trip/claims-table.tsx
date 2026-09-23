"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { PaginationControls } from "@/components/pagination-controls";
import { SortableTh } from "@/components/sortable-th";
import { formatMonthNameYear } from "@/lib/month-format";
import { MoneyInput } from "@/components/form-fields";
import { Trash2, ArrowRightCircle, CheckCircle2, Pencil, Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Avatar } from "@/components/avatar";
import {
  forwardToSales, submitToFinance, markInvoiced, updateTalentPayment, updateBillingStatus, deleteClaim,
} from "./actions";
import {
  CLAIM_TYPES, CLAIM_TYPE_LABELS, CLAIM_TYPE_STYLES, CLAIM_STATUSES, CLAIM_STATUS_LABELS, CLAIM_STATUS_STYLES,
  TALENT_PAYMENT_STATUSES, TALENT_PAYMENT_STATUS_STYLES, BILLING_STATUSES, BILLING_STATUS_STYLES,
} from "./constants";

type ClaimRow = {
  id: string;
  claim_no: string;
  opportunity_id: string | null;
  employee_id: string | null;
  claim_type_code: string;
  claim_title: string;
  days_count: number | null;
  start_date: string | null;
  end_date: string | null;
  duration_hours_client: number | null;
  duration_hours_pmo_basic: number | null;
  duration_hours_payroll: number | null;
  spk_url: string | null;
  timesheet_url: string | null;
  draft_timesheet_url: string | null;
  pq_submit_date: string | null;
  pq_status_code: string | null;
  po_status_code: string | null;
  cr_status_code: string | null;
  pic_1_name: string | null;
  pic_2_name: string | null;
  amount_given_to_talent_initial: number | null;
  given_to_talent_initial_date: string | null;
  amount_claim_to_client_total: number | null;
  amount_bt_medical_to_client: number | null;
  amount_uang_saku_celerates: number | null;
  amount_transport: number | null;
  amount_over_bagasi: number | null;
  amount_etc: number | null;
  amount_total_given_to_talent: number | null;
  talent_payment_status_code: string;
  talent_payment_date: string | null;
  invoice_no: string | null;
  amount_total_billed_to_client: number | null;
  billing_status_code: string;
  status_code: string;
  notes: string | null;
  created_at: Date;
  opty_no: string | null;
  client_name: string | null;
  project_name: string | null;
  employee_no: string | null;
  candidate_name: string | null;
};

const PROGRESS_STATUS_LABELS: Record<string, string> = { not_started: "Not Started", on_progress: "On Progress", done: "Done" };
const PROGRESS_STATUS_STYLES: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-500",
  on_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
};

function ProgressBadge({ code }: { code: string | null }) {
  const c = code ?? "not_started";
  return (
    <span className={`inline-flex items-center rounded-full whitespace-nowrap px-2 py-0.5 text-[11px] font-medium ${PROGRESS_STATUS_STYLES[c] ?? "bg-slate-100 text-slate-500"}`}>
      {PROGRESS_STATUS_LABELS[c] ?? c}
    </span>
  );
}

function LinkOrDash({ url }: { url: string | null }) {
  const t = useTranslations("pmo.overtimeBusinessTrip");
  if (!url) return <span className="text-slate-300">-</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
      {t("openLink")}
    </a>
  );
}

const inputClass = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

function rp(n: number | null): string {
  return n ? `Rp ${n.toLocaleString("id-ID")}` : "-";
}

export function ClaimsTable({
  data, canPmo, canSales, canFinance, canHr,
}: {
  data: ClaimRow[];
  canPmo: boolean;
  canSales: boolean;
  canFinance: boolean;
  canHr: boolean;
}) {
  const t = useTranslations("pmo.overtimeBusinessTrip");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);

  const filters = [
    { key: "claim_type_code", label: t("filterType"), options: CLAIM_TYPES },
    { key: "status_code", label: t("filterStatus"), options: CLAIM_STATUSES },
    { key: "talent_payment_status_code", label: t("filterTalentPayment"), options: TALENT_PAYMENT_STATUSES },
  ];

  return (
    <div>
      <div className="px-6 py-4 border-b border-orange-100 bg-orange-50/40 flex flex-wrap items-center gap-2">
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
                <option value="">{f.label}: {t("filterAll")}</option>
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

        <span className="text-xs text-slate-400 ml-auto">{t("countOf", { filtered: filtered.length, total: data.length })}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-teal-200 bg-teal-50 text-left text-xs font-semibold uppercase tracking-wide text-teal-700">
              <th className="px-4 py-3 sticky left-0 bg-teal-50 z-0 min-w-[90px]">{t("colAction")}</th>
              <th className="px-4 py-3 min-w-[120px]">{t("colClaimMonth")}</th>
              <th className="px-4 py-3 min-w-[130px]">{t("colOptyId")}</th>
              <th className="px-4 py-3 min-w-[120px]">{t("colEmployeeId")}</th>
              <SortableTh
                label={t("colType")}
                sortKey="claim_type_code"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[150px]"
              />
              <SortableTh
                label={t("colTitleTalentClient")}
                sortKey="claim_title"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[220px]"
              />
              <th className="px-4 py-3 min-w-[90px]">{t("colDaysCount")}</th>
              <SortableTh
                label="Start Date"
                sortKey="start_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <th className="px-4 py-3 min-w-[110px]">End Date</th>
              <th className="px-4 py-3 min-w-[130px]">{t("colDurationClient")}</th>
              <th className="px-4 py-3 min-w-[150px]">{t("colDurationPmoBasic")}</th>
              <th className="px-4 py-3 min-w-[130px]">{t("colDurationPayroll")}</th>
              <th className="px-4 py-3 min-w-[90px]">SPK</th>
              <th className="px-4 py-3 min-w-[90px]">Timesheet</th>
              <th className="px-4 py-3 min-w-[110px]">{t("colDraftTimesheet")}</th>
              <th className="px-4 py-3 min-w-[110px]">PQ Submit Date</th>
              <th className="px-4 py-3 min-w-[100px]">PQ Status</th>
              <th className="px-4 py-3 min-w-[100px]">PO Status</th>
              <th className="px-4 py-3 min-w-[100px]">CR Status</th>
              <th className="px-4 py-3 min-w-[120px]">PIC 1 (PMO)</th>
              <th className="px-4 py-3 min-w-[170px]">{t("colFlowStatus")}</th>
              <th className="px-4 py-3 min-w-[150px]">{t("colAmountGivenToTalent")}</th>
              <th className="px-4 py-3 min-w-[130px]">{t("colTotalClaimToClient")}</th>
              <th className="px-4 py-3 min-w-[140px]">{t("colAmountBtMedical")}</th>
              <th className="px-4 py-3 min-w-[150px]">{t("colAmountPocketMoney")}</th>
              <th className="px-4 py-3 min-w-[110px]">{t("colAmountTransport")}</th>
              <th className="px-4 py-3 min-w-[110px]">{t("colAmountOverBaggage")}</th>
              <th className="px-4 py-3 min-w-[100px]">{t("colAmountEtc")}</th>
              <th className="px-4 py-3 min-w-[150px]">{t("colInvoiceFinance")}</th>
              <th className="px-4 py-3 min-w-[160px]">{t("colTalentPaymentHr")}</th>
              <th className="px-4 py-3 min-w-[120px]">PIC 2 (HR)</th>
              <th className="px-4 py-3 min-w-[180px]">{t("colNotes")}</th>
              <th className="px-4 py-3 min-w-[110px]">{t("colCreatedAt")}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((r) => (
              <ClaimRowItem key={r.id} row={r} canPmo={canPmo} canSales={canSales} canFinance={canFinance} canHr={canHr} />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={31} className="px-6 py-10 text-center text-slate-400">{t("noMatchingClaims")}</td></tr>
            )}
          </tbody>
        </table>
        <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
      </div>
    </div>
  );
}

function ClaimRowItem({
  row: r, canPmo, canSales, canFinance, canHr,
}: { row: ClaimRow; canPmo: boolean; canSales: boolean; canFinance: boolean; canHr: boolean }) {
  const t = useTranslations("pmo.overtimeBusinessTrip");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-orange-50/30">
      <td className="px-4 py-3 sticky left-0 bg-white z-0">
        {canPmo && (
          <div className="flex items-center gap-1">
            <Link href={`/pmo/overtime-business-trip/${r.id}/edit`} className="rounded p-1 text-slate-400 hover:bg-violet-100/70" title={tc("edit")}>
              <Pencil className="h-4 w-4" />
            </Link>
            <button
              onClick={() => { if (confirm(t("confirmDeleteClaim"))) startTransition(async () => { await deleteClaim(r.id); }); }}
              disabled={isPending}
              className="rounded p-1 text-red-400 hover:bg-red-50"
              title={tc("delete")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">{formatMonthNameYear(r.start_date ?? r.created_at.toISOString().slice(0, 10))}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.opty_no ?? "-"}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.employee_no ?? "-"}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full whitespace-nowrap px-2.5 py-0.5 text-xs font-medium ${CLAIM_TYPE_STYLES[r.claim_type_code] ?? "bg-slate-100 text-slate-600"}`}>
          {CLAIM_TYPE_LABELS[r.claim_type_code] ?? r.claim_type_code}
        </span>
      </td>
      <td className="px-4 py-3 max-w-[220px]">
        <div className="flex items-start gap-2">
          <Avatar name={r.candidate_name ?? r.claim_title ?? "-"} size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-slate-800 line-clamp-2">{r.claim_title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{r.candidate_name ?? "-"}</p>
            <p className="text-xs text-slate-400">{r.client_name ?? "-"}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">{r.days_count ?? "-"}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{r.start_date ?? "-"}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{r.end_date ?? "-"}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{r.duration_hours_client ?? "-"}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{r.duration_hours_pmo_basic ?? "-"}</td>
      <td className="px-4 py-3 text-xs text-slate-600">{r.duration_hours_payroll ?? "-"}</td>
      <td className="px-4 py-3"><LinkOrDash url={r.spk_url} /></td>
      <td className="px-4 py-3"><LinkOrDash url={r.timesheet_url} /></td>
      <td className="px-4 py-3"><LinkOrDash url={r.draft_timesheet_url} /></td>
      <td className="px-4 py-3 text-xs text-slate-600">{r.pq_submit_date ?? "-"}</td>
      <td className="px-4 py-3"><ProgressBadge code={r.pq_status_code} /></td>
      <td className="px-4 py-3"><ProgressBadge code={r.po_status_code} /></td>
      <td className="px-4 py-3"><ProgressBadge code={r.cr_status_code} /></td>
      <td className="px-4 py-3 text-xs text-slate-600">{r.pic_1_name ?? "-"}</td>
      <td className="px-4 py-3">
        <StatusFlowCell row={r} canPmo={canPmo} canSales={canSales} error={error} setError={setError} />
      </td>
      <td className="px-4 py-3 text-xs text-slate-700">{rp(r.amount_given_to_talent_initial)}</td>
      <td className="px-4 py-3 text-xs text-slate-700 font-medium">{rp(r.amount_claim_to_client_total)}</td>
      <td className="px-4 py-3 text-xs text-slate-700">{rp(r.amount_bt_medical_to_client)}</td>
      <td className="px-4 py-3 text-xs text-slate-700">{rp(r.amount_uang_saku_celerates)}</td>
      <td className="px-4 py-3 text-xs text-slate-700">{rp(r.amount_transport)}</td>
      <td className="px-4 py-3 text-xs text-slate-700">{rp(r.amount_over_bagasi)}</td>
      <td className="px-4 py-3 text-xs text-slate-700">{rp(r.amount_etc)}</td>
      <td className="px-4 py-3">
        <InvoiceCell row={r} canFinance={canFinance} />
      </td>
      <td className="px-4 py-3">
        <TalentPaymentCell row={r} canHr={canHr} />
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">{r.pic_2_name ?? "-"}</td>
      <td className="px-4 py-3 text-xs text-slate-600 max-w-[180px]"><p className="line-clamp-2">{r.notes ?? "-"}</p></td>
      <td className="px-4 py-3 text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString("id-ID")}</td>
    </tr>
  );
}

function StatusFlowCell({
  row: r, canPmo, canSales, error, setError,
}: { row: ClaimRow; canPmo: boolean; canSales: boolean; error: string | null; setError: (e: string | null) => void }) {
  const t = useTranslations("pmo.overtimeBusinessTrip");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1.5">
      <span className={`inline-flex w-fit items-center rounded-full whitespace-nowrap px-2.5 py-0.5 text-xs font-medium ${CLAIM_STATUS_STYLES[r.status_code] ?? "bg-slate-100 text-slate-600"}`}>
        {CLAIM_STATUS_LABELS[r.status_code] ?? r.status_code}
      </span>
      {r.status_code === "draft" && canPmo && (
        <button
          onClick={() => startTransition(async () => { setError(null); const res = await forwardToSales(r.id); if (!res.ok) setError(res.error); })}
          disabled={isPending}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline w-fit"
        >
          <ArrowRightCircle className="h-3.5 w-3.5" /> {t("forwardToSales")}
        </button>
      )}
      {r.status_code === "forwarded_to_sales" && canSales && (
        <button
          onClick={() => startTransition(async () => { setError(null); const res = await submitToFinance(r.id); if (!res.ok) setError(res.error); })}
          disabled={isPending}
          className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline w-fit"
        >
          <ArrowRightCircle className="h-3.5 w-3.5" /> {t("submitToFinance")}
        </button>
      )}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}

function InvoiceCell({ row: r, canFinance }: { row: ClaimRow; canFinance: boolean }) {
  const t = useTranslations("pmo.overtimeBusinessTrip");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (r.status_code === "invoiced" || r.invoice_no) {
    return (
      <div className="text-xs">
        <p className="font-medium text-slate-700">{r.invoice_no}</p>
        <p className="text-slate-400">{rp(r.amount_total_billed_to_client)}</p>
        {canFinance && <BillingStatusSelect row={r} />}
      </div>
    );
  }

  if (r.status_code !== "submitted_to_finance" || !canFinance) {
    return <span className="text-xs text-slate-400">{t("waitingForProcess")}</span>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-violet-600 hover:underline">
        {t("inputInvoice")}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          const res = await markInvoiced(r.id, fd);
          if (!res.ok) { setError(res.error); return; }
          setOpen(false);
        });
      }}
      className="flex flex-col gap-1.5 min-w-[160px]"
    >
      <input name="invoice_no" placeholder={t("invoiceNoPlaceholder")} required className={inputClass} />
      <MoneyInput name="amount_total_billed_to_client" placeholder={t("billedAmountPlaceholder")} className={inputClass} />
      <div className="flex gap-1.5">
        <button type="submit" disabled={isPending} className="rounded bg-violet-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> {t("invoicedButton")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-violet-100/70">{tc("cancel")}</button>
      </div>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </form>
  );
}

function BillingStatusSelect({ row: r }: { row: ClaimRow }) {
  const [isPending, startTransition] = useTransition();
  return (
    <select
      value={r.billing_status_code}
      onChange={(e) => { const v = e.target.value; startTransition(async () => { await updateBillingStatus(r.id, v); }); }}
      disabled={isPending}
      className={`mt-1 text-[10px] rounded-full whitespace-nowrap px-2 py-0.5 font-medium border-0 ${BILLING_STATUS_STYLES[r.billing_status_code] ?? "bg-slate-100 text-slate-600"}`}
    >
      {BILLING_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function TalentPaymentCell({ row: r, canHr }: { row: ClaimRow; canHr: boolean }) {
  const t = useTranslations("pmo.overtimeBusinessTrip");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canHr) {
    return (
      <div className="text-xs">
        <span className={`inline-flex items-center rounded-full whitespace-nowrap px-2 py-0.5 font-medium ${TALENT_PAYMENT_STATUS_STYLES[r.talent_payment_status_code] ?? "bg-slate-100 text-slate-600"}`}>
          {TALENT_PAYMENT_STATUSES.find(([v]) => v === r.talent_payment_status_code)?.[1] ?? r.talent_payment_status_code}
        </span>
        <p className="text-slate-400 mt-1">{rp(r.amount_total_given_to_talent)}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-left">
        <span className={`inline-flex items-center rounded-full whitespace-nowrap px-2 py-0.5 text-xs font-medium ${TALENT_PAYMENT_STATUS_STYLES[r.talent_payment_status_code] ?? "bg-slate-100 text-slate-600"}`}>
          {TALENT_PAYMENT_STATUSES.find(([v]) => v === r.talent_payment_status_code)?.[1] ?? r.talent_payment_status_code}
        </span>
        <p className="text-xs text-slate-400 mt-1">{rp(r.amount_total_given_to_talent)}</p>
        <span className="text-[10px] text-brand-600 hover:underline">{t("updateAction")}</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          const res = await updateTalentPayment(r.id, fd);
          if (!res.ok) { setError(res.error); return; }
          setOpen(false);
        });
      }}
      className="flex flex-col gap-1.5 min-w-[160px]"
    >
      <select name="talent_payment_status_code" defaultValue={r.talent_payment_status_code} className={inputClass}>
        {TALENT_PAYMENT_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <MoneyInput name="amount_total_given_to_talent" defaultValue={r.amount_total_given_to_talent?.toString() ?? ""} placeholder={t("amountGivenPlaceholder")} className={inputClass} />
      <input name="talent_payment_date" type="date" defaultValue={r.talent_payment_date ?? ""} className={inputClass} />
      <div className="flex gap-1.5">
        <button type="submit" disabled={isPending} className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">{tc("save")}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-violet-100/70">{tc("cancel")}</button>
      </div>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </form>
  );
}
