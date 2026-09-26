// Sumber lampiran generik (tabel `attachments`) untuk modul Timesheet.
export const TIMESHEET_EXPORT_SOURCE = "timesheet_export";
export const TIMESHEET_SUBMISSION_SOURCE = "timesheet_submission";

// Header kolom wajib dari file export worklog Jira Tempo (.xlsx). Urutan kolom
// bebas, tapi nama header harus persis ada (dicocokkan case-insensitive & trim).
export const REQUIRED_JIRA_HEADERS = [
  "Issue Key",
  "Issue summary",
  "Hours",
  "Work date",
  "Username",
  "Full name",
  "Project Name",
  "Activity Type",
] as const;

export const SUBMISSION_STATUS_OPTIONS = [
  ["review", "Review"],
  ["approved", "Approved"],
] as const;

export const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

export const MONTH_OPTIONS = MONTH_NAMES_ID.map((name, idx) => [String(idx + 1), name] as const);

// Label placeholder auto-fill kalender harian.
export const LABEL_BELUM_DIISI = "Belum Diisi";
export const LABEL_LIBUR_WEEKEND = "Libur Weekend";
export function labelLiburHoliday(name: string) {
  return `Libur ${name}`;
}

// Nama client yang saat ini eligible untuk Converter (dipilih Talent di form,
// hanya sebagai default/label -- field client_name tetap free text).
export const CONVERTER_DEFAULT_CLIENT = "Astra International";
