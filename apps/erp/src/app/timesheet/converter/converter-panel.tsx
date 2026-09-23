"use client";
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Upload, Plus, Trash2, Download } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { parseAndPreviewConverter, saveAndGenerateConverter, type ConverterPreviewRow } from "../actions";
import { MONTH_NAMES_ID } from "../constants";

const inputClass = "w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function downloadBase64(fileName: string, base64: string) {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  const blob = new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function emptyRow(): ConverterPreviewRow {
  return { entry_date: "", hours: 0, issue_key: "", issue_summary: "", activity_type: "", is_empty: false, username: "", full_name: "", period: "", project_name: "" };
}

/** Grouping baris berdasarkan entry_date berurutan -- persis logika groupInfo di UploadTab.jsx lama. */
type GroupInfo = { isFirstInGroup: boolean; rowSpan: number; groupIndexes: number[] };

function buildGroupInfo(rows: ConverterPreviewRow[]): GroupInfo[] {
  const info: GroupInfo[] = rows.map(() => ({ isFirstInGroup: true, rowSpan: 1, groupIndexes: [] }));
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j].entry_date === rows[i].entry_date) j++;
    const groupIndexes: number[] = [];
    for (let k = i; k < j; k++) groupIndexes.push(k);
    info[i] = { isFirstInGroup: true, rowSpan: j - i, groupIndexes };
    for (let k = i + 1; k < j; k++) info[k] = { isFirstInGroup: false, rowSpan: 0, groupIndexes };
    i = j;
  }
  return info;
}

export function ConverterPanel({ isPmoFull, defaultTalentName }: { isPmoFull: boolean; defaultTalentName: string }) {
  const t = useTranslations("timesheet");
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [talentName, setTalentName] = useState(defaultTalentName);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [rows, setRows] = useState<ConverterPreviewRow[] | null>(null);
  const [mergeView, setMergeView] = useState(true);
  const [isParsing, startParsing] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [result, setResult] = useState<{ fileName: string } | null>(null);

  function handleParse() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) { showToast(t("uploadJiraFileFirst"), "error"); return; }

    const fd = new FormData();
    fd.set("jira_file", file);
    setResult(null);

    startParsing(async () => {
      const parsed = await parseAndPreviewConverter(fd);
      if (!parsed.ok) { showToast(parsed.error, "error"); return; }
      setRows(parsed.data.rows);
      setYear(parsed.data.year);
      setMonth(parsed.data.month);
      if (!talentName.trim()) setTalentName(parsed.data.fullName);
      showToast(t("fileParsedSuccess"));
    });
  }

  function updateRow(idx: number, patch: Partial<ConverterPreviewRow>) {
    setRows((prev) => prev ? prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)) : prev);
  }

  /** Field yang ikut ke-merge (Tanggal/Username/Full Name/Period) -- ubah di baris pertama grup, ikut semua baris di grup itu. Persis updateGroupField di UploadTab.jsx lama. */
  function updateGroupField(groupIndexes: number[], patch: Partial<ConverterPreviewRow>) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      groupIndexes.forEach((idx) => { next[idx] = { ...next[idx], ...patch }; });
      return next;
    });
  }

  function removeRow(idx: number) {
    setRows((prev) => prev ? prev.filter((_, i) => i !== idx) : prev);
  }

  function addRow() {
    setRows((prev) => {
      const last = prev?.[prev.length - 1];
      const base = emptyRow();
      if (last) {
        base.entry_date = last.entry_date;
        base.username = last.username;
        base.full_name = last.full_name || talentName;
        base.period = last.period;
      } else {
        base.full_name = talentName;
      }
      return [...(prev ?? []), base];
    });
  }

  function handleSaveAndGenerate() {
    if (!rows || rows.length === 0) { showToast(t("noRowsToSave"), "error"); return; }
    if (!talentName.trim()) { showToast(t("fullNameRequired"), "error"); return; }
    if (!year || !month) { showToast(t("periodNotDetected"), "error"); return; }
    if (rows.some((r) => !r.entry_date)) { showToast(t("emptyDateRowNote"), "error"); return; }

    startSaving(async () => {
      const res = await saveAndGenerateConverter({ talent_display_name: talentName, year, month, rows });
      if (!res.ok) { showToast(res.error, "error"); return; }
      setResult({ fileName: res.data.fileName });
      downloadBase64(res.data.fileName, res.data.base64);
      showToast(t("timesheetGeneratedSuccess"));
    });
  }

  const filledRows = rows?.filter((r) => !r.is_empty) ?? [];
  const totalHours = filledRows.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
  const emptyCount = (rows?.length ?? 0) - filledRows.length;
  const periodLabel = year && month ? `${MONTH_NAMES_ID[month - 1]} ${year}` : "";
  const groupInfo = rows ? buildGroupInfo(rows) : [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{t("jiraWorklogFileLabel")}</span>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="text-sm" />
        </label>
        <button
          type="button"
          onClick={handleParse}
          disabled={isParsing}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {isParsing ? t("processing") : t("uploadAndProcess")}
        </button>
      </div>
      <p className="text-xs text-slate-400">
        {t("requiredColumnsNote")}
      </p>

      {rows && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t("fullNameLabel")}</span>
              <input
                type="text"
                value={talentName}
                onChange={(e) => setTalentName(e.target.value)}
                disabled={!isPmoFull && !!defaultTalentName}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t("period")}</span>
              <input type="text" value={periodLabel} disabled className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t("totalWorkRows")}</span>
              <input type="text" value={t("rowsCount", { count: filledRows.length })} disabled className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t("totalHours")}</span>
              <input type="text" value={t("hoursCount", { count: totalHours })} disabled className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{t("holidayEmptyLabel")}</span>
              <input type="text" value={t("rowsCount", { count: emptyCount })} disabled className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500" />
            </label>
          </div>

          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {t("timesheetCreatedInline")} <strong>{result.fileName}</strong>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">{t("previewRowsCount", { count: rows.length })}</span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setMergeView((v) => !v)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  {mergeView ? t("turnOffMergeDate") : t("mergeSameDate")}
                </button>
                <button type="button" onClick={addRow} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  <Plus className="h-3.5 w-3.5" /> {t("addRow")}
                </button>
              </div>
            </div>
            <div className="overflow-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-brand-50 text-left font-semibold uppercase tracking-wide text-brand-700">
                  <tr className="border-b border-slate-200">
                    <th className="px-2 py-2 min-w-[36px]">{t("no")}</th>
                    <th className="px-2 py-2 min-w-[60px]">{t("emptyQuestion")}</th>
                    <th className="px-2 py-2 min-w-[100px]">{t("issueKey")}</th>
                    <th className="px-2 py-2 min-w-[160px]">{t("issueSummary")}</th>
                    <th className="px-2 py-2 min-w-[70px]">{t("hours")}</th>
                    <th className="px-2 py-2 min-w-[55px]">{t("md")}</th>
                    <th className="px-2 py-2 min-w-[130px]">{t("workDate")}</th>
                    <th className="px-2 py-2 min-w-[100px]">{t("username")}</th>
                    <th className="px-2 py-2 min-w-[130px]">{t("fullNameColumn")}</th>
                    <th className="px-2 py-2 min-w-[110px]">{t("period")}</th>
                    <th className="px-2 py-2 min-w-[140px]">{t("projectName")}</th>
                    <th className="px-2 py-2 min-w-[150px]">{t("activityType")}</th>
                    <th className="px-2 py-2 min-w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const info = groupInfo[idx];
                    const md = r.is_empty ? "-" : (Math.round((Number(r.hours) / 8) * 1000) / 1000).toString();
                    const isContinuation = mergeView && !info.isFirstInGroup;

                    if (isContinuation) {
                      return (
                        <tr key={idx} className={`border-b border-slate-100 last:border-0 ${r.is_empty ? "bg-amber-50/40" : ""}`}>
                          <td className="px-2 py-1"><input className={inputClass} value={r.issue_key} onChange={(e) => updateRow(idx, { issue_key: e.target.value })} /></td>
                          <td className="px-2 py-1"><input className={inputClass} value={r.issue_summary} onChange={(e) => updateRow(idx, { issue_summary: e.target.value })} /></td>
                          <td className="px-2 py-1"><input className={`${inputClass} text-right`} type="number" step="0.25" value={r.hours} onChange={(e) => updateRow(idx, { hours: Number(e.target.value) })} /></td>
                          <td className="px-2 py-1 text-center text-slate-500">{md}</td>
                          <td className="px-2 py-1"><input className={inputClass} value={r.project_name} onChange={(e) => updateRow(idx, { project_name: e.target.value })} /></td>
                          <td className="px-2 py-1"><input className={inputClass} value={r.activity_type} onChange={(e) => updateRow(idx, { activity_type: e.target.value })} /></td>
                          <td className="px-2 py-1"><button type="button" onClick={() => removeRow(idx)} className="text-slate-400 hover:text-red-600" title={t("deleteRow")}><Trash2 className="h-3.5 w-3.5" /></button></td>
                        </tr>
                      );
                    }

                    const rowSpan = mergeView ? info.rowSpan : 1;
                    return (
                      <tr key={idx} className={`border-b border-slate-100 last:border-0 ${r.is_empty ? "bg-amber-50/40" : ""}`}>
                        <td className="px-2 py-1 text-center text-slate-500" rowSpan={rowSpan}>{idx + 1}</td>
                        <td className="px-2 py-1 text-center" rowSpan={rowSpan}>
                          <input
                            type="checkbox"
                            checked={r.is_empty}
                            onChange={(e) => {
                              if (mergeView && info.groupIndexes.length > 1) updateGroupField(info.groupIndexes, { is_empty: e.target.checked });
                              else updateRow(idx, { is_empty: e.target.checked });
                            }}
                          />
                        </td>
                        <td className="px-2 py-1"><input className={inputClass} value={r.issue_key} onChange={(e) => updateRow(idx, { issue_key: e.target.value })} /></td>
                        <td className="px-2 py-1"><input className={inputClass} value={r.issue_summary} onChange={(e) => updateRow(idx, { issue_summary: e.target.value })} /></td>
                        <td className="px-2 py-1"><input className={`${inputClass} text-right`} type="number" step="0.25" value={r.hours} onChange={(e) => updateRow(idx, { hours: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1 text-center text-slate-500">{md}</td>
                        <td className="px-2 py-1" rowSpan={rowSpan}>
                          <input
                            type="date"
                            className={inputClass}
                            value={r.entry_date}
                            onChange={(e) => {
                              if (mergeView && info.groupIndexes.length > 1) updateGroupField(info.groupIndexes, { entry_date: e.target.value });
                              else updateRow(idx, { entry_date: e.target.value });
                            }}
                          />
                        </td>
                        <td className="px-2 py-1" rowSpan={rowSpan}>
                          <input
                            className={inputClass}
                            value={r.username}
                            onChange={(e) => {
                              if (mergeView && info.groupIndexes.length > 1) updateGroupField(info.groupIndexes, { username: e.target.value });
                              else updateRow(idx, { username: e.target.value });
                            }}
                          />
                        </td>
                        <td className="px-2 py-1" rowSpan={rowSpan}>
                          <input
                            className={inputClass}
                            value={r.full_name}
                            onChange={(e) => {
                              if (mergeView && info.groupIndexes.length > 1) updateGroupField(info.groupIndexes, { full_name: e.target.value });
                              else updateRow(idx, { full_name: e.target.value });
                            }}
                          />
                        </td>
                        <td className="px-2 py-1" rowSpan={rowSpan}>
                          <input
                            className={inputClass}
                            value={r.period}
                            onChange={(e) => {
                              if (mergeView && info.groupIndexes.length > 1) updateGroupField(info.groupIndexes, { period: e.target.value });
                              else updateRow(idx, { period: e.target.value });
                            }}
                          />
                        </td>
                        <td className="px-2 py-1"><input className={inputClass} value={r.project_name} onChange={(e) => updateRow(idx, { project_name: e.target.value })} /></td>
                        <td className="px-2 py-1"><input className={inputClass} value={r.activity_type} onChange={(e) => updateRow(idx, { activity_type: e.target.value })} /></td>
                        <td className="px-2 py-1"><button type="button" onClick={() => removeRow(idx)} className="text-slate-400 hover:text-red-600" title={t("deleteRow")}><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50">
              <button
                type="button"
                onClick={handleSaveAndGenerate}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> {isSaving ? t("creatingFile") : t("generateSaveDownload")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
