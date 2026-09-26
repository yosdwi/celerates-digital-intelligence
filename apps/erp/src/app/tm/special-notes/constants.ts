export const SPECIAL_NOTE_CATEGORIES = [
  ["prorate", "Masih Fase Prorate"],
  ["salary_increase_scheduled", "Kenaikan Gaji Terjadwal"],
  ["double_info", "Info Ganda (Extend + Kenaikan Beda Waktu)"],
  ["effective_date_delay", "Tanggal Efektif Berbeda"],
  ["special_condition", "Kondisi Khusus Lainnya"],
  ["other", "Lainnya"],
] as const;

export const SPECIAL_NOTE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(SPECIAL_NOTE_CATEGORIES);

export const SPECIAL_NOTE_CATEGORY_STYLES: Record<string, string> = {
  prorate: "bg-amber-100 text-amber-700",
  salary_increase_scheduled: "bg-green-100 text-green-700",
  double_info: "bg-purple-100 text-purple-700",
  effective_date_delay: "bg-blue-100 text-blue-700",
  special_condition: "bg-orange-100 text-orange-700",
  other: "bg-slate-100 text-slate-600",
};

export const SPECIAL_NOTE_STATUSES = [
  ["open", "Open"],
  ["acknowledged", "Diketahui HR"],
  ["resolved", "Selesai"],
] as const;

export const SPECIAL_NOTE_STATUS_LABELS: Record<string, string> = Object.fromEntries(SPECIAL_NOTE_STATUSES);

export const SPECIAL_NOTE_STATUS_STYLES: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  acknowledged: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
};

export const DIVISION_LABELS: Record<string, string> = {
  tm: "Talent Management",
  hr: "Human Resources",
};
