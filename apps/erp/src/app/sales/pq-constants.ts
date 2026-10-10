export const PQ_DOCUMENT_SOURCE = "opportunity_pq_doc";
export const PQ_SIGNATURE_SOURCE = "opportunity_pq";
export const PQ_SIGNATURE_STEP = "pq_approval";

// PQ Tracker stages (used by the V1 StageSelector and by Sales V2).
export const PIPELINE_STAGES = [["win", "Win"], ["drop", "Drop"], ["hold", "Hold"], ["on_going", "On Going"]] as const;
export const OPTY_STATUS = [
  ["on_hold", "Project on Hold"], ["client_not_responding", "Client Not Responding"],
  ["lost_pitching", "Lost on Pitching Period"], ["waiting_feedback", "Waiting for Feedback"],
  ["budget_on_hold", "Client Budget on Hold"], ["won", "Project Won"],
  ["closed_lost", "Closed Lost"], ["on_going_others", "Opty on Going Others"],
  ["need_action", "Need Action"],
] as const;

// Pipeline Stage -> Opty Status otomatis -- kalau sales pilih Win/Drop/Hold di
// dropdown Aksi, Opty Status ikut disamain supaya nggak ada 2 status yang
// nyata-nyata beda arti (mis. Win di Aksi tapi Opty Status masih "on_hold").
// "on_going" sengaja TIDAK di-map -- nggak ada satu Opty Status yang pasti
// cocok buat semua kasus "lagi jalan".
export const STAGE_TO_OPTY_STATUS: Record<string, string | undefined> = {
  win: "won",
  drop: "closed_lost",
  hold: "on_hold",
};

// PMO Document Tracker fields the PQ edit form writes (project_documents).
// Sama seperti SALES_TYPES di src/components/opportunity-picker.tsx & PMO
// (src/app/pmo/contracts/[id]/edit/edit-contract-form.tsx) -- field ini nulis
// ke project_documents yang sama, jadi daftarnya harus identik.
export const SALES_TYPES = [
  ["farming", "Farming"], ["new_closing", "New Closing"], ["overtime", "Overtime"],
  ["business_trip", "Business Trip"], ["other", "Other"], ["medical", "Medical"],
] as const;

// Sama seperti STATUS_OPTIONS di src/app/pmo/page.tsx -- field ini nulis ke
// tabel project_documents yang sama dengan Document Tracker PMO, jadi harus
// pakai daftar status yang identik.
export const DOC_STATUS_OPTIONS = [
  ["done_softcopy", "Done Softcopy"], ["done_hardcopy", "Done Hardcopy"], ["on_progress", "On Progress"],
  ["need_fu_hardcopy", "Need FU Hardcopy"], ["need_fu_softcopy", "Need FU Softcopy"], ["none", "None"],
] as const;
