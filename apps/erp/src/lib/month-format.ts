/**
 * Format "YYYY-MM-DD"/"YYYY-MM" jadi "MM-YYYY", lewat string parsing murni
 * (bukan Date) supaya nggak kena isu local-vs-UTC timezone yang sebelumnya
 * bikin billing schedule geser bulan (lihat generateMonthlyBillings di
 * pmo/actions.ts).
 */
export function formatMonthYear(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(5, 7);
  if (!y || !m) return dateStr;
  return `${m}-${y}`;
}

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "2026-08-01" -> "Agustus 2026" */
export function formatMonthNameYear(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  if (!y || !m) return dateStr;
  return `${MONTH_NAMES_ID[m - 1] ?? m} ${y}`;
}

/** "2026-01-01" -> "01-Januari-2026" */
export function formatDdMonthNameYyyy(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const d = dateStr.slice(8, 10);
  if (!y || !m || !d) return dateStr;
  return `${d}-${MONTH_NAMES_ID[m - 1] ?? m}-${y}`;
}
