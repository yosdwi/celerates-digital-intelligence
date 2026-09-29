export const PROJECT_DOC_SOURCES = {
  pks: "project_doc_pks",
  po: "project_doc_po",
  cr: "project_doc_cr",
  other: "project_doc_other",
} as const;
export const INVOICE_BAST_DOC_SOURCE = "invoice_bast_doc";

/** Dropdown "Issues" TM Invoice -- trigger buat tracking bersama antar tim. */
export const INVOICE_ISSUES = [
  ["bast_on_progress_internal", "BAST on Progress Internal"],
  ["bast_menunggu_ttd", "BAST Menunggu Tanda Tangan"],
  ["done_to_finance", "Done to Finance"],
  ["menunggu_cr", "Menunggu CR"],
  ["menunggu_po", "Menunggu PO"],
  ["menunggu_po_cr", "Menunggu PO dan CR"],
  ["menunggu_timesheet", "Menunggu Timesheet"],
  ["periode_belum_selesai", "Periode Belum Selesai"],
] as const;

export const INVOICE_ISSUE_LABELS: Record<string, string> = Object.fromEntries(INVOICE_ISSUES);
