"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { DeleteCandidateButton } from "./delete-candidate-button";
import { SmartFileLink } from "@/components/smart-file-link";
import { PaginationControls } from "@/components/pagination-controls";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { Pill, type PillVariant } from "@/components/pill";
import { Avatar } from "@/components/avatar";
import { GridCard, pickAccent } from "@/components/grid-card";
import type { AttachmentWithUrl } from "@/lib/attachments";
import { Paperclip, Link as LinkIcon, Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { NewBadge } from "@/components/new-badge";
import { SortableTh } from "@/components/sortable-th";

type Candidate = {
  id: string;
  created_at: Date | string;
  candidate_date: string;
  candidate_no: string;
  candidate_name: string;
  position_name: string | null;
  level_code: string | null;
  wa_number: string | null;
  email: string | null;
  current_salary_amount: number | null;
  expected_salary_amount: number | null;
  ta_pic_name: string;
  cv_asli_url: string | null;
  candidate_source_code: string | null;
  candidate_open_status_code: string | null;
  notes: string | null;
  cv_summary: string | null;
  cvAttachments: AttachmentWithUrl[];
};

const LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
const SOURCES = [
  ["hijack_linkedin", "Hijack LinkedIn"], ["linkedin_job_portal", "LinkedIn Job Portal"],
  ["glints", "Glints"], ["google_form_celerates", "Google Form Celerates"], ["referral", "Referral"],
  ["marketing_ads", "Marketing Ads"], ["hiring_partner", "Hiring Partner"],
  ["linkedin_recruiter_post", "LinkedIn Recruiter Post"], ["celerates_connect_wa", "Celerates Connect (WA Community)"],
  ["linkedin_celerates_page", "LinkedIn Celerates Page"], ["database", "Database"], ["kalibrr", "Kalibrr"],
] as const;
const OPEN_STATUS = [
  ["open_dedicated", "Open to Work (Dedicated)"], ["already_worked", "Already worked"], ["open_freelance", "Open (Freelance)"],
] as const;

const VALID_LEVELS = new Set(["internship", "entry_level", "junior", "middle", "senior", "lead", "manager", "vp"]);
const VALID_SOURCES = new Set(["hijack_linkedin", "linkedin_job_portal", "glints", "google_form_celerates", "referral", "marketing_ads", "hiring_partner", "linkedin_recruiter_post", "celerates_connect_wa", "linkedin_celerates_page", "database", "kalibrr"]);
const VALID_OPEN_STATUS = new Set(["open_dedicated", "already_worked", "open_freelance"]);

const OPEN_STATUS_VARIANT: Record<string, PillVariant> = {
  open_dedicated: "info",
  open_freelance: "info",
  already_worked: "neutral",
};
function openStatusVariant(code: string | null): PillVariant {
  return OPEN_STATUS_VARIANT[code ?? ""] ?? "neutral";
}

export function CandidatesTable({ data }: { data: Candidate[] }) {
  const t = useTranslations("ta.candidates.table");
  const tc = useTranslations("common");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);
  const [view, setView] = useState<TableView>("table");

  const filters = [
    { key: "level_code", label: "Level", options: LEVELS },
    { key: "candidate_open_status_code", label: "Open Status", options: OPEN_STATUS },
    { key: "candidate_source_code", label: "Source", options: SOURCES },
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

        <span className="text-xs text-slate-400 ml-auto">{t("countOfTotal", { filtered: filtered.length, total: data.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="px-6 pt-3 text-xs text-amber-600">
        🟡 {t("importWarning")}
      </div>

      {view === "table" && (
      <>
      <div className="overflow-auto max-h-[480px] group-[.is-expanded]:max-h-none group-[.is-expanded]:flex-1 group-[.is-expanded]:min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
              <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[100px]">{t("headerAction")}</th>
              <SortableTh
                label={t("headerDate")}
                sortKey="candidate_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[100px] bg-violet-50 z-10 min-w-[110px]"
              />
              <th className="px-4 py-3 sticky left-[210px] bg-violet-50 z-10 min-w-[130px]">Candidate No</th>
              <SortableTh
                label={t("headerName")}
                sortKey="candidate_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 sticky left-[340px] bg-violet-50 z-10 min-w-[130px] border-r border-slate-200"
              />
              <SortableTh
                label="Positions"
                sortKey="position_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <th className="px-4 py-3 min-w-[90px]">Level</th>
              <th className="px-4 py-3 min-w-[110px]">WA</th>
              <th className="px-4 py-3 min-w-[150px]">Email</th>
              <th className="px-4 py-3 min-w-[120px]">Current Salary</th>
              <th className="px-4 py-3 min-w-[120px]">Expected Salary</th>
              <th className="px-4 py-3 min-w-[110px]">TA PIC</th>
              <th className="px-4 py-3 min-w-[100px]">CV</th>
              <th className="px-4 py-3 min-w-[130px]">Source</th>
              <th className="px-4 py-3 min-w-[140px]">Open Status</th>
              <th className="px-4 py-3 min-w-[200px]">Summary CV</th>
              <th className="px-4 py-3 min-w-[180px]">{t("headerNotes")}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                <td className="px-4 py-3 sticky left-0 bg-white z-0">
                  <div className="flex gap-2 items-center">
                    <Link href={`/ta/candidates/${c.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                    <span className="text-slate-300">|</span>
                    <DeleteCandidateButton candidateId={c.id} />
                  </div>
                </td>
                <td className="px-4 py-3 sticky left-[100px] bg-white z-0 text-slate-600">{c.candidate_date}</td>
                <td className="px-4 py-3 sticky left-[210px] bg-white z-0 font-mono text-xs text-slate-500">{c.candidate_no}</td>
                <td className="px-4 py-3 sticky left-[340px] bg-white z-0 font-medium text-slate-900 border-r border-slate-200">
                  <div className="flex items-center gap-2">
                    <Avatar name={c.candidate_name} size="sm" />
                    <Link href={`/ta/candidates/${c.id}`} className="text-brand-600 hover:underline">{c.candidate_name}</Link>
                    <NewBadge createdAt={c.created_at} />
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.position_name ?? "-"}</td>
                <td className={`px-4 py-3 text-slate-600 ${!VALID_LEVELS.has(c.level_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>{c.level_code ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.wa_number ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.email ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.current_salary_amount ? `Rp ${c.current_salary_amount.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.expected_salary_amount ? `Rp ${c.expected_salary_amount.toLocaleString("id-ID")}` : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{c.ta_pic_name}</td>
                <td className="px-4 py-3 space-y-1">
                  <SmartFileLink value={c.cv_asli_url} label={t("viewLabel")} />
                  {c.cvAttachments.map((a) => (
                    <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                      {a.kind === "link" ? <LinkIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />} {a.file_name}
                    </a>
                  ))}
                </td>
                <td className={`px-4 py-3 text-slate-600 ${!VALID_SOURCES.has(c.candidate_source_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : ""}`}>{c.candidate_source_code ?? "-"}</td>
                <td className="px-4 py-3">
                  {c.candidate_open_status_code == null ? (
                    <span className="text-slate-600">-</span>
                  ) : !VALID_OPEN_STATUS.has(c.candidate_open_status_code) ? (
                    <span className="bg-amber-50 text-amber-700 font-medium px-2 py-1 rounded">{c.candidate_open_status_code}</span>
                  ) : (
                    <Pill variant={openStatusVariant(c.candidate_open_status_code)}>{c.candidate_open_status_code}</Pill>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={c.cv_summary ?? ""}>{c.cv_summary ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600 max-w-[220px] truncate" title={c.notes ?? ""}>{c.notes ?? "-"}</td>
              </tr>
            ))}
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
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {paginated.map((c, i) => (
            <GridCard key={c.id} accent={pickAccent(i)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <Avatar name={c.candidate_name} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Link href={`/ta/candidates/${c.id}`} className="text-base font-semibold text-slate-900 hover:text-brand-600 hover:underline">
                        {c.candidate_name}
                      </Link>
                      <NewBadge createdAt={c.created_at} />
                    </div>
                    <div className="text-xs font-mono text-slate-400">{c.candidate_no}</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Position</span>
                  <span className="text-slate-700 text-right">{c.position_name ?? "-"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Level</span>
                  <span className={`text-right ${!VALID_LEVELS.has(c.level_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : "text-slate-700"}`}>{c.level_code ?? "-"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">TA PIC</span>
                  <span className="text-slate-700 text-right">{c.ta_pic_name}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Expected Salary</span>
                  <span className="text-slate-700 text-right">{c.expected_salary_amount ? `Rp ${c.expected_salary_amount.toLocaleString("id-ID")}` : "-"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Source</span>
                  <span className={`text-right ${!VALID_SOURCES.has(c.candidate_source_code ?? "") ? "bg-amber-50 text-amber-700 font-medium" : "text-slate-700"}`}>{c.candidate_source_code ?? "-"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Open Status</span>
                  {c.candidate_open_status_code == null ? (
                    <span className="text-slate-700">-</span>
                  ) : !VALID_OPEN_STATUS.has(c.candidate_open_status_code) ? (
                    <span className="bg-amber-50 text-amber-700 font-medium px-1 rounded">{c.candidate_open_status_code}</span>
                  ) : (
                    <Pill variant={openStatusVariant(c.candidate_open_status_code)}>{c.candidate_open_status_code}</Pill>
                  )}
                </div>
              </div>
              {c.cv_summary && (
                <p className="mt-2 text-xs text-slate-500 line-clamp-2" title={c.cv_summary}>{c.cv_summary}</p>
              )}
              <div className="mt-auto pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                <Link href={`/ta/candidates/${c.id}/edit`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{tc("edit")}</Link>
                <span className="text-slate-300">|</span>
                <DeleteCandidateButton candidateId={c.id} />
                <SmartFileLink value={c.cv_asli_url} label={t("viewCv")} />
                {c.cvAttachments.map((a) => (
                  <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                    {a.kind === "link" ? <LinkIcon className="h-3 w-3 shrink-0" /> : <Paperclip className="h-3 w-3 shrink-0" />} {a.file_name}
                  </a>
                ))}
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