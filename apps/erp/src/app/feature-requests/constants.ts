export const MODULE_AREAS = [
  ["marketing", "Marketing"],
  ["sales", "Sales"],
  ["ta", "Talent Acquisition"],
  ["hr", "Human Resources"],
  ["tm", "Talent Management"],
  ["pmo", "PMO"],
  ["finance", "Finance"],
  ["executive", "Executive Dashboard"],
  ["tasks", "Task Board"],
  ["ttd", "TTD Online"],
  ["general", "Umum / Lintas Modul"],
] as const;

export const REQUEST_TYPES = [
  ["new_feature", "Fitur Baru"],
  ["improvement", "Peningkatan / Improvement"],
  ["bug_fix", "Bug Fix"],
  ["data_fix", "Perbaikan Data"],
  ["integration", "Integrasi"],
  ["other", "Lainnya"],
] as const;

export const PRIORITIES = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["urgent", "Urgent"],
] as const;

export const STATUSES = [
  ["new", "New"],
  ["pending", "Pending"],
  ["on_develop", "On Develop"],
  ["testing", "Testing"],
  ["done", "Done"],
  ["on_hold", "On Hold"],
  ["rejected", "Rejected"],
] as const;

export const MODULE_AREA_LABELS: Record<string, string> = Object.fromEntries(MODULE_AREAS);
export const REQUEST_TYPE_LABELS: Record<string, string> = Object.fromEntries(REQUEST_TYPES);
export const PRIORITY_LABELS: Record<string, string> = Object.fromEntries(PRIORITIES);
export const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUSES);

export const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};

export const STATUS_STYLES: Record<string, string> = {
  new: "bg-slate-100 text-slate-600",
  pending: "bg-indigo-100 text-indigo-700",
  on_develop: "bg-amber-100 text-amber-700",
  testing: "bg-purple-100 text-purple-700",
  done: "bg-green-100 text-green-700",
  on_hold: "bg-orange-100 text-orange-700",
  rejected: "bg-red-100 text-red-700",
};

export const FEATURE_REQUEST_ATTACHMENT_SOURCE = "feature_request";
