export const CLAIM_TYPES = [
  ["overtime", "Overtime"],
  ["ganti_hari", "Ganti Hari"],
  ["business_trip", "Business Trip (Uang Saku)"],
  ["reimbursement", "Reimbursement"],
  ["medical_claim", "Medical Claim"],
  ["mcu", "MCU"],
  ["cash_advance", "Cash Advance"],
] as const;

export const CLAIM_TYPE_LABELS: Record<string, string> = Object.fromEntries(CLAIM_TYPES);

export const CLAIM_TYPE_STYLES: Record<string, string> = {
  overtime: "bg-blue-100 text-blue-700",
  ganti_hari: "bg-purple-100 text-purple-700",
  business_trip: "bg-orange-100 text-orange-700",
  reimbursement: "bg-emerald-100 text-emerald-700",
  medical_claim: "bg-rose-100 text-rose-700",
  mcu: "bg-cyan-100 text-cyan-700",
  cash_advance: "bg-amber-100 text-amber-700",
};

/** Status utama alur kolaborasi: PMO input -> Sales forward -> Finance submit -> Invoiced. */
export const CLAIM_STATUSES = [
  ["draft", "Draft (PMO)"],
  ["forwarded_to_sales", "Forwarded to Sales"],
  ["submitted_to_finance", "Submitted to Finance"],
  ["invoiced", "Invoiced"],
] as const;

export const CLAIM_STATUS_LABELS: Record<string, string> = Object.fromEntries(CLAIM_STATUSES);

export const CLAIM_STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  forwarded_to_sales: "bg-blue-100 text-blue-700",
  submitted_to_finance: "bg-violet-100 text-violet-700",
  invoiced: "bg-green-100 text-green-700",
};

export const SIMPLE_PROGRESS_STATUSES = [
  ["not_started", "Not Started"],
  ["on_progress", "On Progress"],
  ["done", "Done"],
] as const;

export const TALENT_PAYMENT_STATUSES = [
  ["pending", "Pending"],
  ["done", "Done"],
  ["hold", "Hold"],
] as const;

export const TALENT_PAYMENT_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  hold: "bg-red-100 text-red-700",
};

export const BILLING_STATUSES = SIMPLE_PROGRESS_STATUSES;

export const BILLING_STATUS_STYLES: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-600",
  on_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
};

export const DIVISION_LABELS: Record<string, string> = {
  pmo: "PMO",
  sales: "Sales",
  finance: "Finance",
  hr: "Human Resources",
};
