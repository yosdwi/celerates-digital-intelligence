import { LABEL_BELUM_DIISI, LABEL_LIBUR_WEEKEND, labelLiburHoliday, MONTH_NAMES_ID } from "../constants";
import type { ParsedWorklogRow } from "./jira-parser";

export type CalendarEntryRow = {
  entry_date: string; // ISO yyyy-mm-dd
  hours: number;
  issue_key: string;
  issue_summary: string;
  activity_type: string;
  is_empty: boolean;
  username: string;
  full_name: string;
  period: string;
  project_name: string;
};

export type HolidayRow = { date: string; name: string };

function daysInMonth(year: number, month1indexed: number): number {
  return new Date(Date.UTC(year, month1indexed, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isWeekend(year: number, month1indexed: number, day: number): boolean {
  // getUTCDay: 0=Minggu, 6=Sabtu
  const dow = new Date(Date.UTC(year, month1indexed - 1, day)).getUTCDay();
  return dow === 0 || dow === 6;
}

function periodOf(year: number, month1indexed: number): string {
  return `${MONTH_NAMES_ID[month1indexed - 1]} ${year}`;
}

// Placeholder row pakai literal "-" di semua field teks -- persis mapper.js
// lama (bukan null/string kosong), termasuk kolom Hours yang biarpun angkanya
// 0 di data internal, ditulis sebagai "-" di Excel/preview (lihat astra-generator.ts).
function placeholderRow(entry_date: string, activity_type: string, period: string): CalendarEntryRow {
  return { entry_date, hours: 0, issue_key: "-", issue_summary: "-", activity_type, is_empty: true, username: "-", full_name: "-", period, project_name: "-" };
}

/**
 * Auto-fill semua tanggal kalender sebulan penuh untuk satu user (Talent),
 * dari worklog Jira yang sudah diparsing. SATU BARIS PER WORKLOG (bukan
 * digabung/aggregate) -- kalau sehari ada 3 issue Jira, hasilnya 3 baris
 * dengan entry_date yang sama, persis seperti mapper.js proyek lama. Baris-baris
 * bertanggal sama itu yang nanti ditampilkan gabung (rowSpan, toggle "Gabung
 * Tanggal Sama" di preview) dan di-merge jadi satu sel visual (No/Tanggal/
 * Username/Full Name/Period) di tahap generate Excel (astra-generator.ts),
 * sementara Issue Key/Summary/Hours/Activity Type/Project Name-nya tetap per
 * baris. Hari tanpa worklog dapat SATU baris placeholder: weekend -> "Libur
 * Weekend", tanggal cocok company_holidays -> "Libur <nama>", sisanya ->
 * "Belum Diisi". Murni fungsi, tidak nyentuh employees/opportunities sama sekali.
 */
export function buildMonthlyCalendar(
  parsedRows: ParsedWorklogRow[],
  year: number,
  month1indexed: number,
  holidays: HolidayRow[]
): CalendarEntryRow[] {
  const rowsByDate = new Map<string, ParsedWorklogRow[]>();
  for (const row of parsedRows) {
    if (!row.work_date.startsWith(`${year}-${pad2(month1indexed)}`)) continue; // di luar bulan target, abaikan
    const list = rowsByDate.get(row.work_date) ?? [];
    list.push(row);
    rowsByDate.set(row.work_date, list);
  }

  const holidayByDate = new Map(holidays.map((h) => [h.date, h.name]));
  const total = daysInMonth(year, month1indexed);
  const period = periodOf(year, month1indexed);
  const result: CalendarEntryRow[] = [];

  for (let day = 1; day <= total; day++) {
    const dateStr = `${year}-${pad2(month1indexed)}-${pad2(day)}`;
    const worklogsToday = rowsByDate.get(dateStr);

    if (worklogsToday && worklogsToday.length > 0) {
      for (const w of worklogsToday) {
        result.push({
          entry_date: dateStr,
          hours: w.hours,
          issue_key: w.issue_key,
          issue_summary: w.issue_summary,
          activity_type: w.activity_type || LABEL_BELUM_DIISI,
          is_empty: false,
          username: w.username,
          full_name: w.full_name,
          period: w.period || period,
          project_name: w.project_name,
        });
      }
      continue;
    }

    const holidayName = holidayByDate.get(dateStr);
    if (holidayName) {
      result.push(placeholderRow(dateStr, labelLiburHoliday(holidayName), period));
      continue;
    }

    if (isWeekend(year, month1indexed, day)) {
      result.push(placeholderRow(dateStr, LABEL_LIBUR_WEEKEND, period));
      continue;
    }

    result.push(placeholderRow(dateStr, LABEL_BELUM_DIISI, period));
  }

  return result;
}
