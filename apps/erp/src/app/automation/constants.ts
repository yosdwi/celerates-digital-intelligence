export const REMINDER_TYPES = [
  ["absensi", "Absensi"],
  ["timesheet", "Timesheet"],
] as const;

export const REMINDER_TYPE_LABELS: Record<string, string> = Object.fromEntries(REMINDER_TYPES);

export const DAYS_OF_WEEK = [
  ["0", "Minggu"], ["1", "Senin"], ["2", "Selasa"], ["3", "Rabu"],
  ["4", "Kamis"], ["5", "Jumat"], ["6", "Sabtu"],
] as const;

export const DOCUMENT_TYPES = [
  ["contract", "Kontrak"],
  ["offering", "Offering"],
] as const;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(DOCUMENT_TYPES);
