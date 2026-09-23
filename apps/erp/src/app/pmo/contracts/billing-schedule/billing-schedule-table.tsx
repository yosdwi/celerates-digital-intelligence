"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Building2, Tag, Receipt, Layers, CalendarDays, Wallet } from "lucide-react";
import { BillingCell } from "./billing-cell";
import { Avatar } from "@/components/avatar";

type ContractMeta = {
  id: string;
  opportunity_id: string | null;
  opty_no: string | null;
  client_name: string | null;
  project_name: string | null;
  business_unit_code: string | null;
  service_type_code: string | null;
  sales_type_code: string | null;
  total_value_amount: number | null;
  monthly_value_amount: number | null;
  contract_duration_months: number | null;
  start_date: string | null;
  end_date: string | null;
  po_no: string | null;
  project_details: string;
};

type BillingRow = { id: string; contract_id: string; month: string; amount: number };

type MonthColumn = { type: "month"; key: string } | { type: "total"; key: string; year: string };

// Parsing string tanggal secara manual (bukan lewat Date/toLocaleDateString)
// supaya nggak ketimpa isu local-vs-UTC timezone yang sebelumnya bikin
// billing schedule geser satu bulan (lihat generateMonthlyBillings di actions.ts).
const MONTH_ABBR_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatMonthLabel(monthStr: string) {
  const m = Number(monthStr.slice(5, 7));
  return MONTH_ABBR_ID[m - 1] ?? monthStr;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTH_ABBR_ID[m - 1] ?? m} ${y}`;
}

const BUSINESS_UNIT_LABELS: Record<string, string> = { tm: "TM", cs: "CS", solution: "Solution", other: "Other" };

export function BillingScheduleTable({ contracts, billingRows }: { contracts: ContractMeta[]; billingRows: BillingRow[] }) {
  const t = useTranslations("pmo.contracts.billingSchedule");
  const monthSet = new Set(billingRows.map((r) => r.month));
  const months = [...monthSet].sort();

  const yearGroups: Record<string, string[]> = {};
  months.forEach((m) => {
    const year = m.slice(0, 4);
    if (!yearGroups[year]) yearGroups[year] = [];
    yearGroups[year].push(m);
  });
  const years = Object.keys(yearGroups).sort();

  const columns: MonthColumn[] = [];
  years.forEach((year) => {
    yearGroups[year].forEach((m) => columns.push({ type: "month", key: m }));
    columns.push({ type: "total", key: `total_${year}`, year });
  });

  if (contracts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
        {t("noProjectContractData")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {contracts.map((c) => (
        <ProjectBillingCard key={c.id} contract={c} billingRows={billingRows.filter((b) => b.contract_id === c.id)} years={years} yearGroups={yearGroups} columns={columns} />
      ))}
    </div>
  );
}

function ProjectBillingCard({
  contract: c, billingRows, years, yearGroups, columns,
}: {
  contract: ContractMeta;
  billingRows: BillingRow[];
  years: string[];
  yearGroups: Record<string, string[]>;
  columns: MonthColumn[];
}) {
  const t = useTranslations("pmo.contracts.billingSchedule");
  const [expanded, setExpanded] = useState(true);
  const byMonth: Record<string, { id: string; amount: number }> = {};
  billingRows.forEach((r) => { byMonth[r.month] = { id: r.id, amount: r.amount }; });

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-violet-50/60 text-left">
        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}

        <div className="flex items-center gap-2.5 min-w-[220px]">
          <Avatar name={c.client_name ?? "-"} size="sm" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{c.client_name ?? "-"}</p>
            <p className="text-xs text-slate-500">{c.project_name ?? c.project_details}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {c.opty_no && <Chip icon={Tag} label={c.opty_no} />}
          {c.business_unit_code && <Chip icon={Building2} label={BUSINESS_UNIT_LABELS[c.business_unit_code] ?? c.business_unit_code} tone="violet" />}
          {c.sales_type_code && <Chip icon={Layers} label={c.sales_type_code.replace(/_/g, " ")} tone="blue" />}
          {c.service_type_code && <Chip icon={Layers} label={c.service_type_code.replace(/_/g, " ")} tone="slate" />}
          {c.po_no && <Chip icon={Receipt} label={`PO ${c.po_no}`} tone="amber" />}
        </div>

        <div className="ml-auto flex items-center gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{t("contractValue")}</p>
            <p className="text-sm font-semibold text-slate-900">{c.total_value_amount ? `Rp ${c.total_value_amount.toLocaleString("id-ID")}` : "-"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{t("duration")}</p>
            <p className="text-sm font-semibold text-slate-900">{c.contract_duration_months ? t("monthsShort", { count: c.contract_duration_months }) : "-"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{t("period")}</p>
            <p className="text-sm font-medium text-slate-700">{formatDate(c.start_date)} &ndash; {formatDate(c.end_date)}</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="bg-violet-50 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-4 py-1.5 sticky left-0 bg-violet-50 z-0 min-w-[160px] text-left">
                  <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" /> {t("billing")}</span>
                </th>
                {years.map((year) => (
                  <th key={year} colSpan={yearGroups[year].length + 1} className="px-3 py-1.5 text-center border-l border-slate-200">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {year}</span>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
                <th className="px-4 py-2 sticky left-0 bg-violet-50 z-0 min-w-[160px]">{t("nominalPerMonth")}</th>
                {columns.map((col) => (
                  <th key={col.key} className={`px-3 py-2 text-right min-w-[100px] ${col.type === "total" ? "bg-slate-800 text-white" : ""}`}>
                    {col.type === "month" ? formatMonthLabel(col.key) : t("total")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-violet-50/60">
                <td className="px-4 py-2 sticky left-0 bg-white z-0 text-xs text-slate-400">Rp</td>
                {columns.map((col) => {
                  if (col.type === "total") {
                    const total = yearGroups[col.year].reduce((sum, m) => sum + (byMonth[m]?.amount ?? 0), 0);
                    return (
                      <td key={col.key} className="px-3 py-2 text-right font-semibold bg-slate-50">
                        {total.toLocaleString("id-ID")}
                      </td>
                    );
                  }
                  const cell = byMonth[col.key];
                  return (
                    <td key={col.key} className="px-3 py-2 text-right">
                      <BillingCell billingId={cell?.id ?? null} amount={cell?.amount ?? 0} />
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Chip({ icon: Icon, label, tone = "slate" }: { icon: typeof Tag; label: string; tone?: "slate" | "violet" | "blue" | "amber" }) {
  const styles: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    violet: "bg-violet-100 text-violet-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full whitespace-nowrap px-2 py-0.5 text-[11px] font-medium capitalize ${styles[tone]}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}
