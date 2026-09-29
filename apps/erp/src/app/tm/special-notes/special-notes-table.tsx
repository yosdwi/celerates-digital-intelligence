"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useTableFilter } from "@/hooks/use-table-filter";
import { PaginationControls } from "@/components/pagination-controls";
import { AddRecordModal } from "@/components/add-record-modal";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import { Avatar } from "@/components/avatar";
import { SortableTh } from "@/components/sortable-th";
import { Trash2, Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { createSpecialNote, updateSpecialNoteStatus, deleteSpecialNote } from "./actions";
import {
  SPECIAL_NOTE_CATEGORIES, SPECIAL_NOTE_CATEGORY_LABELS, SPECIAL_NOTE_CATEGORY_STYLES,
  SPECIAL_NOTE_STATUSES, SPECIAL_NOTE_STATUS_LABELS, SPECIAL_NOTE_STATUS_STYLES, DIVISION_LABELS,
} from "./constants";

export type NoteRow = {
  id: string;
  extension_request_id: string;
  category_code: string;
  title: string;
  note_text: string;
  effective_date: string | null;
  status_code: string;
  created_by_name: string;
  created_by_division: string;
  acknowledged_by_name: string | null;
  created_at: Date;
  employee_no: string;
  candidate_name: string | null;
  propose_start_date: string | null;
  propose_end_date: string | null;
};

type ExtensionRequestOption = {
  id: string;
  employee_no: string;
  candidate_name: string | null;
  propose_start_date: string | null;
  propose_end_date: string | null;
};

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";

export function SpecialNotesTable({
  data, extensionRequestOptions, myDivision, userName,
}: {
  data: NoteRow[];
  extensionRequestOptions: ExtensionRequestOption[];
  myDivision: "tm" | "hr" | null;
  userName: string;
}) {
  const t = useTranslations("tm.specialNotes");
  const {
    query, setQuery, activeFilters, setActiveFilters, filtered, paginated, page, setPage, totalPages, pageSize,
    resetFilters, hasActiveFilters, sortKey, sortDirection, toggleSort,
  } = useTableFilter(data);

  const extensionOptions: SearchableOption[] = extensionRequestOptions.map((r) => ({
    value: r.id,
    label: `${r.candidate_name ?? t("talentFallback")} (${r.employee_no})`,
    sublabel: r.propose_start_date && r.propose_end_date ? `${r.propose_start_date} s/d ${r.propose_end_date}` : undefined,
  }));

  async function handleCreate(fd: FormData) {
    const extensionRequestId = fd.get("extension_request_id") as string;
    if (!extensionRequestId) throw new Error(t("selectTalentFirst"));
    await createSpecialNote(extensionRequestId, fd);
  }

  const filters = [
    { key: "category_code", label: t("category"), options: SPECIAL_NOTE_CATEGORIES },
    { key: "status_code", label: "Status", options: SPECIAL_NOTE_STATUSES },
  ];

  return (
    <div>
      <div className="px-6 py-4 border-b border-teal-100 bg-teal-50/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
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

          <span className="text-xs text-slate-400">{t("filteredCount", { filtered: filtered.length, total: data.length })}</span>
        </div>

        <AddRecordModal buttonLabel={t("addButton")} title={t("addModalTitle")} action={handleCreate}>
          <div className="sm:col-span-3">
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("selectTalentLabel")} <span className="text-red-500">*</span></label>
            <SearchableSelect name="extension_request_id" options={extensionOptions} placeholder={t("searchTalentPlaceholder")} required />
          </div>
          <div className="sm:col-span-3 sm:grid sm:grid-cols-2 sm:gap-4 space-y-4 sm:space-y-0">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t("category")}</span>
              <select name="category_code" defaultValue="other" className={inputClass}>
                {SPECIAL_NOTE_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t("effectiveDateOptional")}</span>
              <input name="effective_date" type="date" className={inputClass} />
            </label>
          </div>
          <div className="sm:col-span-3">
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("noteTitleLabel")} <span className="text-red-500">*</span></label>
            <input name="title" required placeholder={t("noteTitlePlaceholder")} className={inputClass} />
          </div>
          <div className="sm:col-span-3">
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("noteDetailLabel")} <span className="text-red-500">*</span></label>
            <textarea name="note_text" rows={4} required placeholder={t("noteDetailPlaceholder")} className={inputClass} />
          </div>
        </AddRecordModal>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-teal-200 bg-teal-50 text-left text-xs font-semibold uppercase tracking-wide text-teal-700">
              <th className="px-4 py-3 min-w-[90px]">{t("colAction")}</th>
              <SortableTh
                label="Talent"
                sortKey="candidate_name"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[180px]"
              />
              <th className="px-4 py-3 min-w-[150px]">{t("colExtendPeriod")}</th>
              <th className="px-4 py-3 min-w-[170px]">{t("category")}</th>
              <th className="px-4 py-3 min-w-[220px]">{t("colNote")}</th>
              <SortableTh
                label={t("colEffectiveDate")}
                sortKey="effective_date"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[110px]"
              />
              <th className="px-4 py-3 min-w-[170px]">Status</th>
              <th className="px-4 py-3 min-w-[160px]">{t("colCreatedBy")}</th>
              <SortableTh
                label={t("colDate")}
                sortKey="created_at"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                className="px-4 py-3 min-w-[100px]"
              />
            </tr>
          </thead>
          <tbody>
            {paginated.map((n) => (
              <NoteRow key={n.id} note={n} myDivision={myDivision} />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-400">{t("noMatchingData")}</td></tr>
            )}
          </tbody>
        </table>
        <PaginationControls page={page} totalPages={totalPages} setPage={setPage} totalItems={filtered.length} pageSize={pageSize} />
      </div>
    </div>
  );
}

function NoteRow({ note: n, myDivision }: { note: NoteRow; myDivision: "tm" | "hr" | null }) {
  const t = useTranslations("tm.specialNotes");
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-teal-50/30">
      <td className="px-4 py-3">
        <button
          onClick={() => { if (confirm(t("confirmDeleteNote"))) { setDeleting(true); startTransition(() => deleteSpecialNote(n.id)); } }}
          disabled={isPending || deleting}
          className="rounded p-1 text-red-400 hover:bg-red-50"
          title={t("deleteTitle")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Avatar name={n.candidate_name ?? t("talentFallback")} size="sm" />
          <div>
            <p className="font-medium text-slate-900">{n.candidate_name ?? t("talentFallback")}</p>
            <p className="text-xs text-slate-400">{n.employee_no}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {n.propose_start_date && n.propose_end_date ? `${n.propose_start_date} s/d ${n.propose_end_date}` : "-"}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full whitespace-nowrap px-2.5 py-0.5 text-xs font-medium ${SPECIAL_NOTE_CATEGORY_STYLES[n.category_code] ?? "bg-slate-100 text-slate-600"}`}>
          {SPECIAL_NOTE_CATEGORY_LABELS[n.category_code] ?? n.category_code}
        </span>
      </td>
      <td className="px-4 py-3 max-w-[220px]">
        <p className="font-medium text-slate-800">{n.title}</p>
        <p className="text-xs text-slate-500 line-clamp-2">{n.note_text}</p>
      </td>
      <td className="px-4 py-3 text-slate-600">{n.effective_date ?? "-"}</td>
      <td className="px-4 py-3">
        <select
          value={n.status_code}
          onChange={(e) => startTransition(() => updateSpecialNoteStatus(n.id, e.target.value))}
          disabled={isPending}
          className={`text-xs rounded-full whitespace-nowrap px-2 py-1 font-medium border-0 ${SPECIAL_NOTE_STATUS_STYLES[n.status_code] ?? "bg-slate-100 text-slate-600"}`}
        >
          {SPECIAL_NOTE_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {n.acknowledged_by_name && <p className="mt-1 text-[10px] text-slate-400">{t("acknowledgedBy", { name: n.acknowledged_by_name })}</p>}
      </td>
      <td className="px-4 py-3">
        <p className="text-slate-700">{n.created_by_name}</p>
        <span className={`inline-block mt-0.5 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${n.created_by_division === "tm" ? "bg-sky-100 text-sky-700" : "bg-rose-100 text-rose-700"}`}>
          {DIVISION_LABELS[n.created_by_division] ?? n.created_by_division}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-400">{new Date(n.created_at).toLocaleDateString("id-ID")}</td>
    </tr>
  );
}
