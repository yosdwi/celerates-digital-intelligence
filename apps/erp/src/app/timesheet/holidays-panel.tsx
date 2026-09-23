"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field } from "@/components/form-fields";
import { useToast } from "@/components/toast-provider";
import { createHoliday, bulkCreateHolidays } from "./actions";
import { DeleteHolidayButton } from "./delete-holiday-button";

type HolidayRow = { id: string; date: string; name: string };

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01", januari: "01",
  feb: "02", february: "02", februari: "02",
  mar: "03", march: "03", maret: "03",
  apr: "04", april: "04",
  mei: "05", may: "05",
  jun: "06", june: "06", juni: "06",
  jul: "07", july: "07", juli: "07",
  agu: "08", aug: "08", august: "08", agustus: "08",
  sep: "09", september: "09",
  okt: "10", oct: "10", october: "10", oktober: "10",
  nov: "11", november: "11",
  des: "12", dec: "12", december: "12", desember: "12",
};

function parseDateToken(token: string): string | null {
  const cleaned = token.trim();
  const m1 = cleaned.match(/(\d{1,2})\s*-\s*([A-Za-z]+)\.?\s*-\s*(\d{4})/);
  if (m1) {
    const day = m1[1].padStart(2, "0");
    const month = MONTH_MAP[m1[2].toLowerCase()];
    if (month) return `${m1[3]}-${month}-${day}`;
  }
  const m2 = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return cleaned;
  return null;
}

type BulkPreview = { parsed: { date: string; name: string }[]; failed: string[] };

/** Port setia parseBulkText di HolidaysTab.jsx lama -- paste teks tab-separated dari spreadsheet kalender libur, cari kolom tanggal & nama otomatis per baris. */
function parseBulkText(text: string): BulkPreview {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed: { date: string; name: string }[] = [];
  const failed: string[] = [];

  for (const line of lines) {
    const cols = line.split("\t").map((c) => c.trim()).filter((c) => c !== "");
    if (cols.length < 2) { failed.push(line); continue; }

    let dateStr: string | null = null;
    const nameParts: string[] = [];
    for (const col of cols) {
      if (!dateStr) {
        const parsedDate = parseDateToken(col);
        if (parsedDate) { dateStr = parsedDate; continue; }
      }
      nameParts.push(col);
    }
    if (!dateStr || nameParts.length === 0) { failed.push(line); continue; }
    parsed.push({ date: dateStr, name: nameParts[nameParts.length - 1] });
  }
  return { parsed, failed };
}

/**
 * `canDelete=false` dipakai di halaman Converter buat Talent (boleh nambah
 * hari libur yang kelupaan sebelum parsing, tapi hapus tetap eksklusif
 * PMO-full/Owner supaya satu talent nggak bisa menghapus data bersama).
 */
export function HolidaysPanel({ data, canDelete = true }: { data: HolidayRow[]; canDelete?: boolean }) {
  const t = useTranslations("timesheet");
  const { showToast } = useToast();
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [isImporting, startImporting] = useTransition();

  function handlePreview() {
    setBulkPreview(parseBulkText(bulkText));
  }

  function handleBulkImport() {
    if (!bulkPreview || bulkPreview.parsed.length === 0) return;
    startImporting(async () => {
      const res = await bulkCreateHolidays(bulkPreview.parsed);
      if (!res.ok) { showToast(res.error, "error"); return; }
      showToast(t("holidaysImportedSuccess", { count: res.data.count }));
      setBulkText("");
      setBulkPreview(null);
    });
  }

  return (
    <div>
      <div className="px-6 py-4 border-b border-slate-100">
        <AddRecordModal buttonLabel={t("addHoliday")} title={t("addHoliday")} action={createHoliday}>
          <Field label={t("dateLabel")} name="date" type="date" required />
          <div className="sm:col-span-2">
            <Field label={t("holidayNameLabel")} name="name" placeholder={t("holidayNamePlaceholder")} required />
          </div>
        </AddRecordModal>
      </div>

      <div className="px-6 py-4 border-b border-slate-100 space-y-2">
        <span className="block text-xs font-medium text-slate-600">{t("bulkImportLabel")}</span>
        <textarea
          rows={5}
          placeholder={t("bulkImportPlaceholder")}
          value={bulkText}
          onChange={(e) => { setBulkText(e.target.value); setBulkPreview(null); }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handlePreview} disabled={!bulkText.trim()} className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-40">
            {t("checkParseResult")}
          </button>
          {bulkPreview && (
            <button
              type="button"
              onClick={handleBulkImport}
              disabled={isImporting || bulkPreview.parsed.length === 0}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              {isImporting ? t("importing") : t("importHolidaysButton", { count: bulkPreview.parsed.length })}
            </button>
          )}
        </div>

        {bulkPreview && (
          <div className="pt-2">
            <p className="text-xs text-slate-500 mb-2">
              {t("rowsReadSuccess", { count: bulkPreview.parsed.length })}
              {bulkPreview.failed.length > 0 && t("rowsReadFailedSuffix", { count: bulkPreview.failed.length })}
            </p>
            {bulkPreview.parsed.length > 0 && (
              <div className="overflow-auto max-h-[200px] rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-brand-50 text-left text-brand-700">
                    <tr><th className="px-3 py-1.5">{t("dateLabel")}</th><th className="px-3 py-1.5">{t("nameLabel")}</th></tr>
                  </thead>
                  <tbody>
                    {bulkPreview.parsed.map((h, i) => (
                      <tr key={i} className="border-t border-slate-100"><td className="px-3 py-1.5">{h.date}</td><td className="px-3 py-1.5">{h.name}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bulkPreview.failed.length > 0 && (
              <div className="mt-2 text-xs text-red-600 space-y-1">
                <p>{t("failedRowsNote")}</p>
                {bulkPreview.failed.map((line, i) => <div key={i} className="font-mono text-[11px]">{line}</div>)}
              </div>
            )}
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="px-6 py-10 text-center text-slate-400 text-sm">{t("noHolidaysRegistered")}</div>
      ) : (
        <div className="overflow-auto max-h-[360px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-brand-50 text-left text-xs font-semibold uppercase tracking-wide text-brand-700">
              <tr className="border-b border-slate-200">
                {canDelete && <th className="px-4 py-3 min-w-[100px]">{t("actions")}</th>}
                <th className="px-4 py-3 min-w-[130px]">{t("dateLabel")}</th>
                <th className="px-4 py-3 min-w-[250px]">{t("holidayNameLabel")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {canDelete && <td className="px-4 py-3"><DeleteHolidayButton holidayId={h.id} /></td>}
                  <td className="px-4 py-3 text-slate-600">{h.date}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{h.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
