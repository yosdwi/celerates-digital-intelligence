"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { DocumentButton } from "./document-button";
import { PromoteButton } from "./promote-button";
import { DeleteOnboardingButton } from "./delete-onboarding-button";
import { ConvertToPqTrackerButton } from "./convert-to-pq-tracker-button";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { Pill, type PillVariant } from "@/components/pill";
import { Avatar } from "@/components/avatar";
import { GridCard, pickAccent } from "@/components/grid-card";
import type { AttachmentWithUrl } from "@/lib/attachments";
import type { SignerOption } from "@/lib/approval-journey";
import { OfferingLetterSignatureStatus, type OfferingLetterSignatureInfo } from "./offering-letter-signature-status";
import { Paperclip, Link as LinkIcon, Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { NewBadge } from "@/components/new-badge";
import { SortableTh } from "@/components/sortable-th";

type OnboardingRow = {
  id: string;
  created_at: Date | string;
  candidate_no: string | null;
  candidate_name: string | null;
  client_name: string | null;
  position_name: string | null;
  ta_pic_name: string;
  employee_status_code: string | null;
  salary_deal_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  basic_salary_amount: number | null;
  functional_allowance_amount: number | null;
  transport_allowance_amount: number | null;
  project_allowance_amount: number | null;
  accommodation_allowance_amount: number | null;
  field_allowance_amount: number | null;
  overtime_allowance_amount: number | null;
  offering_letter_path: string | null;
  ktp_file_path: string | null;
  bpjs_kesehatan_file_path: string | null;
  bpjs_ketenagakerjaan_file_path: string | null;
  npwp_file_path: string | null;
  kk_file_path: string | null;
  diploma_file_path: string | null;
  certification_file_path: string | null;
  formal_photo_file_path: string | null;
  docAttachments: { label: string; items: AttachmentWithUrl[] }[];
  offeringLetterSignature: OfferingLetterSignatureInfo;
};

const EMPLOYEE_STATUS = [
  ["new_hire", "New Hire"], ["replacement", "Replacement"], ["internal", "Internal"],
  ["freelance", "Freelance"], ["bootcamp", "Bootcamp"],
] as const;

const EMPLOYEE_STATUS_VARIANT: Record<string, PillVariant> = {
  new_hire: "info",
  replacement: "neutral",
  internal: "neutral",
  freelance: "info",
  bootcamp: "info",
};
function employeeStatusVariant(code: string | null): PillVariant {
  return EMPLOYEE_STATUS_VARIANT[code ?? ""] ?? "neutral";
}

export function OnboardingTable({
  data,
  promotedIds,
  convertedIds,
  userOptions,
}: {
  data: OnboardingRow[];
  promotedIds: string[];
  convertedIds: string[];
  userOptions: SignerOption[];
}) {
  const t = useTranslations("ta.onboarding.table");
  const tc = useTranslations("common");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");
  const promotedSet = new Set(promotedIds);
  const convertedSet = new Set(convertedIds);

  const filters = [{ key: "employee_status_code", label: "Employee Status", options: EMPLOYEE_STATUS }];

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
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "table" && (
      <>
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[220px]">{t("aksi")}</th>
              <th className="px-4 py-3 sticky left-[220px] bg-violet-50 z-10 min-w-[130px]">{t("aksi")}</th>
              <th className="px-4 py-3 sticky left-[350px] bg-violet-50 z-10 min-w-[120px]">{t("candidateId")}</th>
              <SortableTh
                label={t("candidate")}
                sortKey="candidate_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[470px] bg-violet-50 z-10 min-w-[130px] border-r border-slate-200"
              />
              <th className="px-4 py-3 min-w-[130px]">{t("klien")}</th>
              <th className="px-4 py-3 min-w-[130px]">{t("positions")}</th>
              <th className="px-4 py-3 min-w-[110px]">{t("status")}</th>
              <SortableTh
                label={t("salaryDeal")}
                sortKey="salary_deal_amount"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[130px]"
              />
              <SortableTh
                label={t("start")}
                sortKey="start_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <th className="px-4 py-3 min-w-[110px]">{t("end")}</th>
              <th className="px-4 py-3 min-w-[130px]">{t("grossSalary")}</th>
              <th className="px-4 py-3 min-w-[110px]">{t("taPic")}</th>
              <th className="px-4 py-3 min-w-[160px]">{t("offeringLetterTtd")}</th>
              <th className="px-4 py-3 min-w-[300px]">{t("dokumen")}</th>
            </tr>
          </thead>
          <tbody>
          {paginated.map((r) => {
            const gross =
              (r.basic_salary_amount ?? 0) +
              (r.functional_allowance_amount ?? 0) +
              (r.transport_allowance_amount ?? 0) +
              (r.project_allowance_amount ?? 0) +
              (r.accommodation_allowance_amount ?? 0) +
              (r.field_allowance_amount ?? 0) +
              (r.overtime_allowance_amount ?? 0);
            return (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                <td className="px-4 py-3 sticky left-0 bg-white z-0">
                  {promotedSet.has(r.id) ? (
                    <Pill variant="success">{t("alreadyEmployee")}</Pill>
                  ) : (
                    <>
                      <ConvertToPqTrackerButton onboardingRequestId={r.id} alreadyConverted={convertedSet.has(r.id)} />
                      <p className="text-[10px] text-amber-600 mt-1 mb-1">⚠️ {t("promoteWarning")}</p>
                      <PromoteButton onboardingRequestId={r.id} />
                    </>
                  )}
                </td>
                <td className="px-4 py-3 sticky left-[220px] bg-white z-0">
                  <div className="flex gap-2 items-center">
                    <Link href={`/ta/onboarding/${r.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteOnboardingButton onboardingId={r.id} />
                  </div>
                </td>
                <td className="px-4 py-3 sticky left-[350px] bg-white z-0 font-mono text-xs text-slate-500">{r.candidate_no ?? "-"}</td>
                <td className="px-4 py-3 sticky left-[470px] bg-white z-0 font-medium text-slate-900 border-r border-slate-200">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.candidate_name ?? "-"} size="sm" />
                    {r.candidate_name ?? "-"}
                    <NewBadge createdAt={r.created_at} />
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.client_name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{r.position_name ?? "-"}</td>
                <td className="px-4 py-3">
                  {r.employee_status_code == null ? (
                    <span className="text-slate-600">-</span>
                  ) : (
                    <Pill variant={employeeStatusVariant(r.employee_status_code)}>{r.employee_status_code}</Pill>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.salary_deal_amount ? `Rp ${r.salary_deal_amount.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{r.start_date ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{r.end_date ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{gross > 0 ? `Rp ${gross.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{r.ta_pic_name}</td>
                <td className="px-4 py-3">
                  <OfferingLetterSignatureStatus
                    onboardingRequestId={r.id}
                    info={r.offeringLetterSignature}
                    userOptions={userOptions}
                    existingDocs={r.docAttachments.find((d) => d.label === "Offering Letter")?.items ?? []}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <DocumentButton path={r.offering_letter_path} label={t("docOffering")} />
                    <DocumentButton path={r.ktp_file_path} label={t("docKtp")} />
                    <DocumentButton path={r.bpjs_kesehatan_file_path} label={t("docBpjsKes")} />
                    <DocumentButton path={r.bpjs_ketenagakerjaan_file_path} label={t("docBpjsTk")} />
                    <DocumentButton path={r.npwp_file_path} label={t("docNpwp")} />
                    <DocumentButton path={r.kk_file_path} label={t("docKk")} />
                    <DocumentButton path={r.diploma_file_path} label={t("docIjazah")} />
                    <DocumentButton path={r.certification_file_path} label={t("docSertifikat")} />
                    <DocumentButton path={r.formal_photo_file_path} label={t("docFoto")} />
                  </div>
                  {r.docAttachments.some((d) => d.items.length > 0) && (
                    <div className="flex flex-wrap gap-2 mt-1.5 pt-1.5 border-t border-slate-100">
                      {r.docAttachments.flatMap((d) =>
                        d.items.map((a) => (
                          <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline" title={d.label}>
                            {a.kind === "link" ? <LinkIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />} {d.label}: {a.file_name}
                          </a>
                        ))
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr><td colSpan={13} className="px-6 py-10 text-center text-slate-400">{t("noData")}</td></tr>
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
            {paginated.map((r, idx) => {
              const gross =
                (r.basic_salary_amount ?? 0) +
                (r.functional_allowance_amount ?? 0) +
                (r.transport_allowance_amount ?? 0) +
                (r.project_allowance_amount ?? 0) +
                (r.accommodation_allowance_amount ?? 0) +
                (r.field_allowance_amount ?? 0) +
                (r.overtime_allowance_amount ?? 0);
              return (
                <GridCard key={r.id} accent={pickAccent(idx)}>
                  <div className="flex items-start gap-2.5">
                    <Avatar name={r.candidate_name ?? "-"} />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-base font-semibold text-slate-900">{r.candidate_name ?? "-"}</p>
                        <NewBadge createdAt={r.created_at} />
                      </div>
                      <p className="text-xs font-mono text-slate-400">{r.candidate_no ?? "-"}</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("klien")}</span>
                      <span className="text-slate-700 font-medium text-right">{r.client_name ?? "-"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("positions")}</span>
                      <span className="text-slate-700 text-right">{r.position_name ?? "-"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("status")}</span>
                      {r.employee_status_code == null ? (
                        <span className="text-slate-700">-</span>
                      ) : (
                        <Pill variant={employeeStatusVariant(r.employee_status_code)}>{r.employee_status_code}</Pill>
                      )}
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("salaryDeal")}</span>
                      <span className="text-slate-700 text-right">{r.salary_deal_amount ? `Rp ${r.salary_deal_amount.toLocaleString("id-ID")}` : "-"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("startEnd")}</span>
                      <span className="text-slate-700 text-right">{r.start_date ?? "-"} &ndash; {r.end_date ?? "-"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("grossSalary")}</span>
                      <span className="text-slate-700 text-right">{gross > 0 ? `Rp ${gross.toLocaleString("id-ID")}` : "-"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">{t("taPic")}</span>
                      <span className="text-slate-700 text-right">{r.ta_pic_name}</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <OfferingLetterSignatureStatus
                      onboardingRequestId={r.id}
                      info={r.offeringLetterSignature}
                      userOptions={userOptions}
                      existingDocs={r.docAttachments.find((d) => d.label === "Offering Letter")?.items ?? []}
                    />
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                    <DocumentButton path={r.offering_letter_path} label={t("docOffering")} />
                    <DocumentButton path={r.ktp_file_path} label={t("docKtp")} />
                    <DocumentButton path={r.bpjs_kesehatan_file_path} label={t("docBpjsKes")} />
                    <DocumentButton path={r.bpjs_ketenagakerjaan_file_path} label={t("docBpjsTk")} />
                    <DocumentButton path={r.npwp_file_path} label={t("docNpwp")} />
                    <DocumentButton path={r.kk_file_path} label={t("docKk")} />
                    <DocumentButton path={r.diploma_file_path} label={t("docIjazah")} />
                    <DocumentButton path={r.certification_file_path} label={t("docSertifikat")} />
                    <DocumentButton path={r.formal_photo_file_path} label={t("docFoto")} />
                  </div>
                  {r.docAttachments.some((d) => d.items.length > 0) && (
                    <div className="flex flex-wrap gap-2 mt-1.5 pt-1.5 border-t border-slate-100">
                      {r.docAttachments.flatMap((d) =>
                        d.items.map((a) => (
                          <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline" title={d.label}>
                            {a.kind === "link" ? <LinkIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />} {d.label}: {a.file_name}
                          </a>
                        ))
                      )}
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-slate-100 space-y-1.5">
                    {promotedSet.has(r.id) ? (
                      <Pill variant="success">{t("alreadyEmployee")}</Pill>
                    ) : (
                      <>
                        <ConvertToPqTrackerButton onboardingRequestId={r.id} alreadyConverted={convertedSet.has(r.id)} />
                        <p className="text-[10px] text-amber-600 mt-1 mb-1">⚠️ {t("promoteWarning")}</p>
                        <PromoteButton onboardingRequestId={r.id} />
                      </>
                    )}
                    <div className="flex gap-2 items-center">
                      <Link href={`/ta/onboarding/${r.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                      <span className="text-slate-300">|</span>
                      <DeleteOnboardingButton onboardingId={r.id} />
                    </div>
                  </div>
                </GridCard>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full px-6 py-10 text-center text-slate-400">{t("noData")}</div>
            )}
          </div>
          <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
        </>
      )}
    </div>
  );
}