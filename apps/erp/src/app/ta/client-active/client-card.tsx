"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { HiringStatusBadge } from "../pipeline/hiring-status-badge";
import { ClientSubmissionStatus } from "./client-submission-status";
import { CLIENT_SUBMISSION_STATUSES } from "./constants";

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

const SORT_VALUES = [
  "candidate_name_asc",
  "candidate_name_desc",
  "position_name_asc",
  "position_name_desc",
  "price_amount_desc",
  "price_amount_asc",
  "hiring_status_code_asc",
  "client_submission_status_code_asc",
] as const;
type SortValue = (typeof SORT_VALUES)[number];

export type ClientActiveRow = {
  id: string;
  candidate_no: string | null;
  candidate_name: string | null;
  wa_number: string | null;
  email: string | null;
  level_code: string | null;
  hiring_status_code: string;
  price_amount: number | null;
  client_submission_status_code: string | null;
  client_submission_updated_at: Date | null;
  client_submission_updated_by_name: string | null;
  client_submission_note: string | null;
  position_name: string | null;
};

export function ClientCard({ clientName, items }: { clientName: string; items: ClientActiveRow[] }) {
  const t = useTranslations("ta.clientActive.card");
  const [query, setQuery] = useState("");
  const [hiringFilter, setHiringFilter] = useState("");
  const [clientStatusFilter, setClientStatusFilter] = useState("");
  const [sortValue, setSortValue] = useState<SortValue>("candidate_name_asc");

  const SORT_OPTIONS = useMemo(
    () =>
      SORT_VALUES.map((v) => [v, t(`sortOptions.${v}`)] as const),
    [t]
  );

  const visible = useMemo(() => {
    let result = items;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter((r) =>
        [r.candidate_no, r.candidate_name, r.position_name, r.wa_number, r.email]
          .some((v) => v != null && String(v).toLowerCase().includes(q))
      );
    }
    if (hiringFilter) {
      result = result.filter((r) => r.hiring_status_code === hiringFilter);
    }
    if (clientStatusFilter) {
      result = clientStatusFilter === "not_sent"
        ? result.filter((r) => !r.client_submission_status_code)
        : result.filter((r) => r.client_submission_status_code === clientStatusFilter);
    }

    const [field, dir] = sortValue.split(/_(asc|desc)$/).filter(Boolean) as [keyof ClientActiveRow, "asc" | "desc"];
    const sorted = [...result].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return sorted;
  }, [items, query, hiringFilter, clientStatusFilter, sortValue]);

  return (
    <details className="group rounded-xl border border-teal-200 bg-white shadow-sm open:shadow-md">
      <summary className="flex cursor-pointer items-center gap-3 px-5 py-4 list-none">
        <span className="text-teal-500 transition-transform group-open:rotate-90">&#9656;</span>
        <span className="text-sm font-semibold text-slate-900">{clientName}</span>
        <span className="text-xs text-slate-400">({t("candidateCount", { count: items.length })})</span>
      </summary>

      <div className="border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-slate-50/60" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs w-full max-w-[240px] focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <select value={hiringFilter} onChange={(e) => setHiringFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
            <option value="">{t("hiringStatusAll")}</option>
            {HIRING_STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={clientStatusFilter} onChange={(e) => setClientStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
            <option value="">{t("clientStatusAll")}</option>
            <option value="not_sent">{t("notSentToClient")}</option>
            {CLIENT_SUBMISSION_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={sortValue} onChange={(e) => setSortValue(e.target.value as SortValue)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
            {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{t("sortPrefix")}: {l}</option>)}
          </select>
          <span className="text-[11px] text-slate-400 ml-auto">{t("countOf", { shown: visible.length, total: items.length })}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-200 bg-brand-50 text-left text-xs font-semibold uppercase tracking-wide text-brand-700">
                <th className="px-4 py-3 min-w-[130px]">Candidate No</th>
                <th className="px-4 py-3 min-w-[150px]">{t("name")}</th>
                <th className="px-4 py-3 min-w-[130px]">Positions</th>
                <th className="px-4 py-3 min-w-[100px]">Level</th>
                <th className="px-4 py-3 min-w-[130px]">WA</th>
                <th className="px-4 py-3 min-w-[170px]">Email</th>
                <th className="px-4 py-3 min-w-[130px]">Price</th>
                <th className="px-4 py-3 min-w-[140px]">Hiring Status (TA)</th>
                <th className="px-4 py-3 min-w-[220px]">Client Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.candidate_no ?? "-"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{r.candidate_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.position_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.level_code ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.wa_number ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.email ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.price_amount ? `Rp ${r.price_amount.toLocaleString("id-ID")}` : "-"}</td>
                  <td className="px-4 py-3"><HiringStatusBadge hiringStatusCode={r.hiring_status_code} /></td>
                  <td className="px-4 py-3">
                    <ClientSubmissionStatus
                      applicationId={r.id}
                      info={{
                        statusCode: r.client_submission_status_code,
                        updatedAt: r.client_submission_updated_at ? r.client_submission_updated_at.toISOString() : null,
                        updatedByName: r.client_submission_updated_by_name,
                        note: r.client_submission_note,
                      }}
                    />
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-8 text-center text-slate-400">{t("noMatchingCandidates")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
