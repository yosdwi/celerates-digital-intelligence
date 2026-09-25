import { sql } from "drizzle-orm";
import { pgTable, uuid, text, boolean, integer, smallint, date, timestamp, check, uniqueIndex, index, doublePrecision, AnyPgColumn } from "drizzle-orm/pg-core";


export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  lead_no: text("lead_no").notNull(),
  client_name: text("client_name").notNull(),
  contact_name: text("contact_name").notNull(),
  contact_email: text("contact_email"),
  contact_phone: text("contact_phone"),
  company_size: integer("company_size"),
  industry_code: text("industry_code"),
  service_type_code: text("service_type_code").notNull(),
  lead_source_code: text("lead_source_code").notNull(),
  category_code: text("category_code").notNull(),
  sales_pic_name: text("sales_pic_name").notNull(),
  notes: text("notes"),
  is_qualified: boolean("is_qualified"),
  disqualify_reason: text("disqualify_reason"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Nama project & estimasi harga -- diisi pas Lead dibuat, bukan lagi pas
  // convert ke Opportunity (convert sekarang cuma konfirmasi, tanpa isi field).
  project_name: text("project_name"),
  price_amount: integer("price_amount"),
  price_period_code: text("price_period_code"), // monthly | project | yearly | daily
  // Position/Headcount/Level/Durasi -- diisi di Lead supaya bisa auto-pull ke
  // Opportunity Tracker pas convert (dulu 4 field ini nggak ada sama sekali
  // di Lead jadi harus diisi manual lagi di Sales).
  position_name: text("position_name"),
  headcount_target: integer("headcount_target"),
  level_code: text("level_code"), // internship..vp, sama seperti opportunities.level_code
  estimated_duration_months: integer("estimated_duration_months"),
}, (t) => ({
  ckDisqualifyReason: check(
    "ck_leads_disqualify_reason",
    sql`(${t.is_qualified} IS DISTINCT FROM false) OR (length(${t.disqualify_reason}) >= 10)`
  ),
  uqLeadNo: uniqueIndex("uq_leads_lead_no").on(t.lead_no),
}));

export const salesOpportunityTrackers = pgTable("sales_opportunity_trackers", {
  id: uuid("id").defaultRandom().primaryKey(),
  lead_id: uuid("lead_id").references(() => leads.id),
  opty_no: text("opty_no").notNull(),
  sales_qualified: boolean("sales_qualified").notNull().default(false),
  client_name: text("client_name").notNull(),
  service_type_code: text("service_type_code"),
  requirement_summary: text("requirement_summary"),
  opty_status_code: text("opty_status_code").notNull().default("cv_submission"), // cv_submission | solutioning | proposal_sent | win | dropped
  progress_notes: text("progress_notes"),
  estimated_deal_amount: integer("estimated_deal_amount"),
  detail_requirement: text("detail_requirement"),
  client_type_code: text("client_type_code"), // existing | new
  sales_pic_name: text("sales_pic_name").notNull(),
  last_communication_date: date("last_communication_date"),
  bante_score: smallint("bante_score"), // 1-5
  dropped_reason: text("dropped_reason"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  position_name: text("position_name"),
  level_code: text("level_code"),
  headcount_target: integer("headcount_target"),
  price_amount: integer("price_amount"),
  price_period_code: text("price_period_code"), // monthly | project | yearly | daily
  estimated_duration_months: integer("estimated_duration_months"),
}, (t) => ({
  uqOptyNo: uniqueIndex("uq_sales_opportunity_trackers_opty_no").on(t.opty_no),
  idxLead: index("idx_sales_opportunity_trackers_lead").on(t.lead_id),
}));

export const opportunities = pgTable("opportunities", {
  id: uuid("id").defaultRandom().primaryKey(),
  lead_id: uuid("lead_id").references(() => leads.id),
  opportunity_tracker_id: uuid("opportunity_tracker_id").references((): AnyPgColumn => salesOpportunityTrackers.id),
  onboarding_request_id: uuid("onboarding_request_id").references(() => onboardingRequests.id),
  opty_no: text("opty_no").notNull(),
  opty_request_date: date("opty_request_date"),
  pq_no: text("pq_no"),
  client_name: text("client_name").notNull(),
  client_type_code: text("client_type_code"), // existing | new
  project_name: text("project_name").notNull(),
  position_name: text("position_name"),
  service_type_code: text("service_type_code").notNull(),
  business_unit_code: text("business_unit_code"), // tm | cs | solution | other
  level_code: text("level_code"), // internship..vp
  headcount_target: integer("headcount_target"),
  priority_code: text("priority_code"), // p0-p3
  bant_score: smallint("bant_score"), // 1-5
  price_amount: integer("price_amount"),
  price_period_code: text("price_period_code"), // monthly | project | yearly | daily
  estimated_duration_months: integer("estimated_duration_months"),
  approval_date: date("approval_date"),
  po_doc_url: text("po_doc_url"),
  sales_pic_name: text("sales_pic_name").notNull(),
  pipeline_stage_code: text("pipeline_stage_code").notNull().default("on_going"),
  opty_status_code: text("opty_status_code"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  start_date: date("start_date"),
  end_date: date("end_date"),
}, (t) => ({
  uqOptyNo: uniqueIndex("uq_opportunities_opty_no").on(t.opty_no),
  idxLead: index("idx_opportunities_lead").on(t.lead_id),
  idxOpportunityTracker: index("idx_opportunities_opportunity_tracker").on(t.opportunity_tracker_id),
  idxOnboardingRequest: index("idx_opportunities_onboarding_request").on(t.onboarding_request_id),
}));

export const requisitions = pgTable("requisitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  requisition_no: text("requisition_no").notNull(),
  opportunity_id: uuid("opportunity_id").references((): AnyPgColumn => salesOpportunityTrackers.id),
  opty_request_date: date("opty_request_date"),
  client_name: text("client_name").notNull(),
  position_name: text("position_name").notNull(),
  service_type_code: text("service_type_code"),
  level_code: text("level_code"),
  opty_status_code: text("opty_status_code"),
  headcount_target: integer("headcount_target").notNull().default(1),
  priority_code: text("priority_code").notNull().default("p2"),
  price_amount: integer("price_amount"),
  estimated_duration_months: integer("estimated_duration_months"),
  ta_pic_name: text("ta_pic_name").notNull(),
  // PIC dari sisi Sales -- terpisah dari ta_pic_name supaya convert dari Opportunity
  // Tracker nggak lagi menimpa TA PIC dengan nama Sales PIC.
  sales_pic_name: text("sales_pic_name"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqRequisitionNo: uniqueIndex("uq_requisitions_requisition_no").on(t.requisition_no),
  idxOpportunity: index("idx_requisitions_opportunity").on(t.opportunity_id),
}));

export const candidates = pgTable("candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidate_no: text("candidate_no").notNull(),
  candidate_date: date("candidate_date").notNull().defaultNow(),
  candidate_name: text("candidate_name").notNull(),
  position_name: text("position_name"),
  level_code: text("level_code"),
  wa_number: text("wa_number"),
  email: text("email"),
  current_salary_amount: integer("current_salary_amount"),
  expected_salary_amount: integer("expected_salary_amount"),
  ta_pic_name: text("ta_pic_name").notNull(),
  cv_asli_url: text("cv_asli_url"),
  candidate_source_code: text("candidate_source_code"),
  notes: text("notes"),
  candidate_open_status_code: text("candidate_open_status_code"),
  cv_summary: text("cv_summary"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqCandidateNo: uniqueIndex("uq_candidates_candidate_no").on(t.candidate_no),
}));

export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  application_date: date("application_date").notNull().defaultNow(),
  requisition_id: uuid("requisition_id").references(() => requisitions.id),
  candidate_id: uuid("candidate_id").references(() => candidates.id),
  level_code: text("level_code"),
  ta_pic_name: text("ta_pic_name").notNull(),
  cv_asli_url: text("cv_asli_url"),
  cv_celerates_url: text("cv_celerates_url"),
  candidate_source_code: text("candidate_source_code"),
  notes: text("notes"),
  price_amount: integer("price_amount"),
  hiring_status_code: text("hiring_status_code").notNull().default("cv_sent"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // --- Client Active: journey status kolaborasi TA <-> Sales, terpisah dari hiring_status_code TA ---
  client_submission_status_code: text("client_submission_status_code"), // null = belum dikirim ke client
  client_submission_updated_at: timestamp("client_submission_updated_at", { withTimezone: true }),
  client_submission_updated_by_name: text("client_submission_updated_by_name"),
  client_submission_note: text("client_submission_note"),
}, (t) => ({
  idxRequisition: index("idx_applications_requisition").on(t.requisition_id),
  idxCandidate: index("idx_applications_candidate").on(t.candidate_id),
}));

/**
 * Recruitment Onboard Request -- 60 field dari sumber asli.
 * Kolom data pribadi sensitif (nik, npwp, family_card_no, bank_account_no) DIENKRIPSI
 * app-level (AES-256-GCM, lihat src/lib/pii-crypto.ts) sebelum insert/update, dan
 * didekripsi di titik baca (src/app/hr/[id]/page.tsx, src/app/tm/database-salary/page.tsx,
 * src/app/ta/onboarding/[id]/edit/page.tsx). Key di PII_ENCRYPTION_KEY (.env).
 *
 * Catatan: ini reuse kolom `text` yang sudah ada (bukan kolom baru bertipe
 * `bytea` dengan suffix `_enc` seperti disebut ADR-007 di 04-ARCHITECTURE.md),
 * dan key di .env bukan KMS/secret manager -- pendekatan pragmatis yang
 * disepakati karena bagian lain ADR-007 (blind index, KMS) belum relevan
 * selama tidak ada kebutuhan search-by-NIK dkk.
 */
export const onboardingRequests = pgTable("onboarding_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidate_id: uuid("candidate_id").references(() => candidates.id),
  requisition_id: uuid("requisition_id").references(() => requisitions.id),
  ta_pic_name: text("ta_pic_name").notNull(),

  // --- Kontrak ---
  salary_deal_amount: integer("salary_deal_amount"),
  offering_letter_path: text("offering_letter_path"),
  employee_status_code: text("employee_status_code"),
  start_date: date("start_date"),
  end_date: date("end_date"),
  needs_laptop: boolean("needs_laptop").notNull().default(false),
  needs_id_card: boolean("needs_id_card").notNull().default(false),

  // --- Data Pribadi ---
  nik: text("nik"),
  birth_place: text("birth_place"),
  birth_date: date("birth_date"),
  id_card_address: text("id_card_address"),
  current_address: text("current_address"),
  education_level_code: text("education_level_code"),
  institution_name: text("institution_name"),
  major: text("major"),
  gpa: text("gpa"),
  personal_email: text("personal_email"),
  personal_phone: text("personal_phone"),
  npwp: text("npwp"),
  family_card_no: text("family_card_no"),
  marital_status_code: text("marital_status_code"),
  dependent_count: integer("dependent_count"),
  bank_account_no: text("bank_account_no"),
  bank_name: text("bank_name"),
  bank_account_holder_name: text("bank_account_holder_name"),
  bank_branch_name: text("bank_branch_name"),
  bpjs_kesehatan_personal_no: text("bpjs_kesehatan_personal_no"),
  bpjs_kesehatan_willing_transfer: boolean("bpjs_kesehatan_willing_transfer"),
  bpjs_ketenagakerjaan_personal_no: text("bpjs_ketenagakerjaan_personal_no"),
  emergency_contact_name: text("emergency_contact_name"),
  emergency_contact_relationship: text("emergency_contact_relationship"),
  emergency_contact_phone: text("emergency_contact_phone"),
  available_start_date: date("available_start_date"),
  mother_maiden_name: text("mother_maiden_name"),
  blood_type_code: text("blood_type_code"),
  employment_type_code: text("employment_type_code"),

  // --- Data Karyawan (dipakai saat Promote ke Employee) ---
  employee_category_code: text("employee_category_code"),
  job_level_code: text("job_level_code"),
  company_email: text("company_email"),
  gender_code: text("gender_code"),
  religion_code: text("religion_code"),
  ptkp_code: text("ptkp_code"),

  // --- Dokumen (path di Supabase Storage, bukan URL publik) ---
  ktp_file_path: text("ktp_file_path"),
  bpjs_kesehatan_file_path: text("bpjs_kesehatan_file_path"),
  bpjs_ketenagakerjaan_file_path: text("bpjs_ketenagakerjaan_file_path"),
  npwp_file_path: text("npwp_file_path"),
  kk_file_path: text("kk_file_path"),
  diploma_file_path: text("diploma_file_path"),
  certification_file_path: text("certification_file_path"),
  formal_photo_file_path: text("formal_photo_file_path"),

  // --- Kompensasi ---
  price_amount: integer("price_amount"),
  basic_salary_amount: integer("basic_salary_amount"),
  functional_allowance_amount: integer("functional_allowance_amount"),
  transport_allowance_amount: integer("transport_allowance_amount"),
  project_allowance_amount: integer("project_allowance_amount"),
  accommodation_allowance_amount: integer("accommodation_allowance_amount"),
  field_allowance_amount: integer("field_allowance_amount"),
  overtime_allowance_amount: integer("overtime_allowance_amount"),

  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxCandidate: index("idx_onboarding_requests_candidate").on(t.candidate_id),
  idxRequisition: index("idx_onboarding_requests_requisition").on(t.requisition_id),
}));

export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  onboarding_request_id: uuid("onboarding_request_id").references(() => onboardingRequests.id),
  employee_no: text("employee_no").notNull(),
  employee_category_code: text("employee_category_code"),
  job_level_code: text("job_level_code"),
  position_name: text("position_name"),
  company_email: text("company_email"),
  join_date: date("join_date"),
  gender_code: text("gender_code"),
  religion_code: text("religion_code"),
  marital_status_changed_date: date("marital_status_changed_date"),
  ptkp_code: text("ptkp_code"),
  ptkp_effective_year: integer("ptkp_effective_year"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqEmployeeNo: uniqueIndex("uq_employees_employee_no").on(t.employee_no),
  idxOnboardingRequest: index("idx_employees_onboarding_request").on(t.onboarding_request_id),
}));

export const employmentContracts = pgTable("employment_contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  employee_id: uuid("employee_id").notNull().references(() => employees.id),
  parent_contract_id: uuid("parent_contract_id").references((): AnyPgColumn => employmentContracts.id),
  contract_no: text("contract_no").notNull(),
  addendum_seq: smallint("addendum_seq"),
  document_date: date("document_date"),
  signed_date: date("signed_date"),
  start_date: date("start_date").notNull(),
  end_date: date("end_date"),
  duration_months: integer("duration_months"),
  employment_type_code: text("employment_type_code").notNull(),
  sk_no: text("sk_no"),
  sk_date: date("sk_date"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqContractNo: uniqueIndex("uq_employment_contracts_contract_no").on(t.contract_no),
  idxEmployee: index("idx_employment_contracts_employee").on(t.employee_id),
}));

export const bpjsRegistrations = pgTable("bpjs_registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  employee_id: uuid("employee_id").notNull().references(() => employees.id),
  scheme: text("scheme").notNull(),
  company_no: text("company_no"),
  status_code: text("status_code"),
  due_month: date("due_month"),
  deduction_start_month: date("deduction_start_month"),
  registered_date: date("registered_date"),
  card_sent_date: date("card_sent_date"),
  active_month: date("active_month"),
  sipp_active_date: date("sipp_active_date"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxEmployee: index("idx_bpjs_registrations_employee").on(t.employee_id),
}));

export const pics = pgTable("pics", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqName: uniqueIndex("uq_pics_name").on(t.name),
}));

export const divisions = pgTable("divisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqKey: uniqueIndex("uq_divisions_key").on(t.key),
}));

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  full_name: text("full_name").notNull(),
  role_title: text("role_title"),
  password_hash: text("password_hash"),
  google_sub: text("google_sub"),
  status: text("status").notNull().default("pending"),
  is_owner: boolean("is_owner").notNull().default(false),
  requested_division_id: uuid("requested_division_id").references(() => divisions.id),
  // account_type "backoffice" (default, semua akun lama & flow lama) atau "talent"
  // (akun baru khusus modul Timesheet -- tidak pilih divisi, sidebar/middleware
  // dibatasi cuma ke /timesheet/**).
  account_type: text("account_type").notNull().default("backoffice"),
  // Khusus account_type "talent": dikurasi Owner/PMO-full lewat Access Management,
  // menentukan apakah talent ini boleh pakai Timesheet Converter (client Astra dkk).
  can_use_timesheet_converter: boolean("can_use_timesheet_converter").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqEmail: uniqueIndex("uq_users_email").on(t.email),
  idxRequestedDivision: index("idx_users_requested_division").on(t.requested_division_id),
}));

export const userAccess = pgTable("user_access", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  division_id: uuid("division_id").notNull().references(() => divisions.id),
  level: text("level").notNull(),
  granted_by_user_id: uuid("granted_by_user_id").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqUserDivision: uniqueIndex("uq_user_access_user_division").on(t.user_id, t.division_id),
  idxDivision: index("idx_user_access_division").on(t.division_id),
}));

export const talentAssignments = pgTable("talent_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  employee_id: uuid("employee_id").notNull().references(() => employees.id),
  requisition_id: uuid("requisition_id").references(() => requisitions.id),
  start_date: date("start_date"),
  end_date: date("end_date"),
  status_code: text("status_code"), // project_contract_status: on_project | extended | ended | on_hold
  talent_track_code: text("talent_track_code"),
  increment_date: date("increment_date"),
  current_grading: text("current_grading"),
  current_salary_grade_code: text("current_salary_grade_code"),
  price_amount: integer("price_amount"),
  current_skill: text("current_skill"),
  current_certification: text("current_certification"),
  performance_appraisal_result: text("performance_appraisal_result"),
  performance_review_result: text("performance_review_result"),
  people_summarize: text("people_summarize"),
  increment_amount_deal: integer("increment_amount_deal"),
  increment_percent_deal: integer("increment_percent_deal"),
  status_all_data_code: text("status_all_data_code"),
  notes: text("notes"),
  basic_salary_amount: integer("basic_salary_amount"),
  functional_allowance_amount: integer("functional_allowance_amount"),
  transport_allowance_amount: integer("transport_allowance_amount"),
  project_allowance_amount: integer("project_allowance_amount"),
  accommodation_allowance_amount: integer("accommodation_allowance_amount"),
  field_allowance_amount: integer("field_allowance_amount"),
  overtime_allowance_amount: integer("overtime_allowance_amount"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  pq_tracker_id: uuid("pq_tracker_id").references(() => opportunities.id),

  // --- B. Tax ---
  tax_bruto_amount: integer("tax_bruto_amount"),

  // --- C. Salary ---
  gross_salary_amount: integer("gross_salary_amount"),
  take_home_pay_amount: integer("take_home_pay_amount"),

  // --- F. Other Component ---
  kompensasi_amount: integer("kompensasi_amount"),
  thr_allowance_amount: integer("thr_allowance_amount"),
  annual_bonus_allowance_amount: integer("annual_bonus_allowance_amount"),
  annual_medical_reimbursement_amount: integer("annual_medical_reimbursement_amount"),
  laptop_ownership_amount: integer("laptop_ownership_amount"),
  training_amount: integer("training_amount"),
  refreshment_amount: integer("refreshment_amount"),

  // --- G. BPJS Company Portion ---
  bpjs_kesehatan_company_amount: integer("bpjs_kesehatan_company_amount"),
  jkk_amount: integer("jkk_amount"),
  jkm_amount: integer("jkm_amount"),
  jht_company_amount: integer("jht_company_amount"),
  jkp_amount: integer("jkp_amount"),
  jp_company_amount: integer("jp_company_amount"),

  // --- H. BPJS Deduction - Employee Portion ---
  bpjs_kesehatan_employee_amount: integer("bpjs_kesehatan_employee_amount"),
  jht_employee_amount: integer("jht_employee_amount"),
  jp_employee_amount: integer("jp_employee_amount"),

  // --- I. Total ---
  management_fee_amount: integer("management_fee_amount"),
  // Total COGS asli (monthlyRemunerationCost + overheadAllocation) dari COGS
  // Calculator -- sebelumnya cuma grossMargin (Price-COGS) yang kesimpen lewat
  // management_fee_amount, angka COGS mentahnya sendiri nggak pernah disimpan.
  total_cogs_amount: integer("total_cogs_amount"),
}, (t) => ({
  idxEmployee: index("idx_talent_assignments_employee").on(t.employee_id),
  idxRequisition: index("idx_talent_assignments_requisition").on(t.requisition_id),
  idxPqTracker: index("idx_talent_assignments_pq_tracker").on(t.pq_tracker_id),
}));

export const extensionIncrementRequests = pgTable("extension_increment_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  employee_id: uuid("employee_id").notNull().references(() => employees.id),
  requisition_id: uuid("requisition_id").references(() => requisitions.id),
  // Diisi kalau request ini lahir dari flow "Add Extension Request" di Sales
  // (bikin row PQ Tracker baru buat deal perpanjangannya) -- null kalau
  // request dibuat manual dari TM seperti biasa (tidak selalu ada PQ baru).
  pq_tracker_id: uuid("pq_tracker_id").references(() => opportunities.id),
  propose_start_date: date("propose_start_date"),
  propose_end_date: date("propose_end_date"),
  proposed_position_name: text("proposed_position_name"),
  proposed_grade_level_code: text("proposed_grade_level_code"),
  proposed_employment_type_code: text("proposed_employment_type_code"),
  proposed_basic_salary_amount: integer("proposed_basic_salary_amount"),
  proposed_transport_allowance_amount: integer("proposed_transport_allowance_amount"),
  proposed_project_allowance_amount: integer("proposed_project_allowance_amount"),
  proposed_accommodation_allowance_amount: integer("proposed_accommodation_allowance_amount"),
  proposed_overtime_allowance_amount: integer("proposed_overtime_allowance_amount"),
  // Increment yang diajukan -- begitu request ini approved, ini yang narik ke
  // talent_assignments.increment_amount_deal/increment_percent_deal.
  proposed_increment_amount_deal: integer("proposed_increment_amount_deal"),
  proposed_increment_percent_deal: integer("proposed_increment_percent_deal"),
  requester_name: text("requester_name").notNull(),
  approved_by_1_name: text("approved_by_1_name"),
  approved_by_2_name: text("approved_by_2_name"),
  approved_by_3_name: text("approved_by_3_name"),
  acknowledged_by_name: text("acknowledged_by_name"),
  status_code: text("status_code").notNull().default("pending"), // pending | approved | rejected
  // Status lanjutan di sisi HR setelah TM approve semua (approval 1-3 + acknowledge).
  hr_status_code: text("hr_status_code").notNull().default("waiting_hr"), // waiting_hr | processed
  employment_contract_id: uuid("employment_contract_id").references((): AnyPgColumn => employmentContracts.id),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // --- Approval Journey (TTD Online) ---
  requester_user_id: uuid("requester_user_id").references(() => users.id),
  approver_1_user_id: uuid("approver_1_user_id").references(() => users.id),
  approver_2_user_id: uuid("approver_2_user_id").references(() => users.id),
  approver_3_user_id: uuid("approver_3_user_id").references(() => users.id),
  acknowledger_user_id: uuid("acknowledger_user_id").references(() => users.id),
  owner_override: boolean("owner_override").notNull().default(false),
  owner_override_by_name: text("owner_override_by_name"),
  owner_override_at: timestamp("owner_override_at", { withTimezone: true }),
}, (t) => ({
  idxEmployee: index("idx_extension_increment_requests_employee").on(t.employee_id),
  idxRequisition: index("idx_extension_increment_requests_requisition").on(t.requisition_id),
  idxEmploymentContract: index("idx_extension_increment_requests_employment_contract").on(t.employment_contract_id),
  idxPqTracker: index("idx_extension_increment_requests_pq_tracker").on(t.pq_tracker_id),
}));

/**
 * Catatan khusus dari Talent Management ke Human Resources terkait sebuah
 * Extension/Increment Request -- untuk kasus spesial seperti masih fase prorate,
 * kenaikan gaji terjadwal di bulan tertentu (beda waktu dengan perpanjangan),
 * atau kondisi khusus lain yang perlu diketahui HR saat memproses.
 */
export const extensionRequestSpecialNotes = pgTable("extension_request_special_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  extension_request_id: uuid("extension_request_id").notNull().references(() => extensionIncrementRequests.id, { onDelete: "cascade" }),
  category_code: text("category_code").notNull().default("other"), // prorate | salary_increase_scheduled | double_info | effective_date_delay | special_condition | other
  title: text("title").notNull(),
  note_text: text("note_text").notNull(),
  effective_date: date("effective_date"),
  status_code: text("status_code").notNull().default("open"), // open | acknowledged | resolved
  created_by_name: text("created_by_name").notNull(),
  created_by_division: text("created_by_division").notNull(), // tm | hr
  acknowledged_by_name: text("acknowledged_by_name"),
  acknowledged_at: timestamp("acknowledged_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxExtensionRequest: index("idx_special_notes_extension_request").on(t.extension_request_id),
}));

export const projectDocuments = pgTable("project_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  opportunity_id: uuid("opportunity_id").notNull().references(() => opportunities.id),
  project_details: text("project_details"),
  pq_price: integer("pq_price"),
  pq_total: integer("pq_total"),
  pks_no: text("pks_no"),
  pks_url: text("pks_url"),
  pks_status_code: text("pks_status_code"),
  po_start_date: date("po_start_date"),
  po_end_date: date("po_end_date"),
  po_no: text("po_no"),
  po_url: text("po_url"),
  po_status_code: text("po_status_code"),
  cr_no: text("cr_no"),
  cr_url: text("cr_url"),
  cr_status_code: text("cr_status_code"),
  other_doc_no: text("other_doc_no"),
  other_doc_url: text("other_doc_url"),
  other_doc_status_code: text("other_doc_status_code"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sales_type_code: text("sales_type_code"),
}, (t) => ({
  idxOpportunity: index("idx_project_documents_opportunity").on(t.opportunity_id),
}));

export const projectContracts = pgTable("project_contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  opportunity_id: uuid("opportunity_id").notNull().references(() => opportunities.id),
  monthly_value_amount: integer("monthly_value_amount"),
  total_value_amount: integer("total_value_amount"),
  contract_duration_months: integer("contract_duration_months"),
  start_date: date("start_date"),
  end_date: date("end_date"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sales_type_code: text("sales_type_code"),
}, (t) => ({
  idxOpportunity: index("idx_project_contracts_opportunity").on(t.opportunity_id),
}));

export const projectInvoices = pgTable("project_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  opportunity_id: uuid("opportunity_id").notNull().references(() => opportunities.id),
  invoice_plan_date: date("invoice_plan_date"),
  group_name: text("group_name"),
  services_month_start: date("services_month_start"),
  price_per_month: integer("price_per_month"),
  status_code: text("status_code"), // submitted | overdue | planned
  bast_support_doc_url: text("bast_support_doc_url"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Issue tracking bareng PMO -- trigger buat tracking bersama kalau ada kendala.
  issue_code: text("issue_code"),
  // Tanggal PMO submit BAST -- buat tracking pengiriman BAST, terpisah dari BAST doc-nya sendiri.
  submit_bast_date: date("submit_bast_date"),
}, (t) => ({
  idxOpportunity: index("idx_project_invoices_opportunity").on(t.opportunity_id),
  idxOpportunityMonth: index("idx_project_invoices_opportunity_month").on(t.opportunity_id, t.services_month_start),
}));

/**
 * Dokumen kolaborasi PMO <-> Finance per invoice/opportunity: PMO menyerahkan
 * link dokumen dan notify Finance, Finance verifikasi lalu tandai diterima
 * atau kembalikan ke PMO kalau ada yang kurang -- dua arah, bukan cuma satu arah.
 */
export const financeDocumentHandoffs = pgTable("finance_document_handoffs", {
  id: uuid("id").defaultRandom().primaryKey(),
  opportunity_id: uuid("opportunity_id").notNull().references(() => opportunities.id),
  doc_url: text("doc_url"),
  status_code: text("status_code").notNull().default("pending"), // pending | notified | received | needs_revision
  notified_at: timestamp("notified_at", { withTimezone: true }),
  notified_by_name: text("notified_by_name"),
  notes: text("notes"),
  received_at: timestamp("received_at", { withTimezone: true }),
  received_by_name: text("received_by_name"),
  finance_notes: text("finance_notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqOpportunity: uniqueIndex("uq_finance_document_handoffs_opportunity").on(t.opportunity_id),
  idxPending: index("idx_finance_handoffs_pending").on(t.status_code, t.opportunity_id).where(sql`${t.status_code} IN ('notified','needs_revision')`),
}));

export const projectMonthlyBillings = pgTable("project_monthly_billings", {
  id: uuid("id").defaultRandom().primaryKey(),
  contract_id: uuid("contract_id").notNull().references(() => projectContracts.id),
  month: date("month").notNull(), // selalu tanggal 1 (2026-01-01, 2026-02-01, dst)
  amount: integer("amount").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxContract: index("idx_project_monthly_billings_contract").on(t.contract_id),
}));

/**
 * Kalender hari libur perusahaan (nasional/cuti bersama) -- dipakai buat
 * auto-fill "Libur <nama>" di Timesheet Tracker waktu ngisi kalender harian
 * sebulan penuh. Admin PMO yang kelola daftar ini.
 */
export const companyHolidays = pgTable("company_holidays", {
  id: uuid("id").defaultRandom().primaryKey(),
  date: date("date").notNull(),
  name: text("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqDate: uniqueIndex("uq_company_holidays_date").on(t.date),
}));

/**
 * Timesheet (modul top-level terpisah dari PMO, lihat src/app/timesheet) --
 * satu baris per hari kalender per user per bulan, hasil parsing worklog Jira
 * Tempo (.xlsx) yang di-auto-fill penuh sebulan (hari kosong = "Belum Diisi",
 * weekend = "Libur Weekend", tanggal yang cocok di company_holidays =
 * "Libur <nama>") lalu bisa diedit manual sebelum disimpan. Simpan-ulang
 * untuk user+periode yang sama akan mengganti (delete-then-insert) baris
 * lama, sama seperti project_monthly_billings.
 *
 * SENGAJA tidak FK ke employees/opportunities -- modul ini lepas total dari
 * data bisnis ERP yang sudah ada, cuma nempel ke `users.id` (akun yang login,
 * Talent atau Backoffice-PMO-full) + client_name bebas teks.
 */
export const timesheetEntries = pgTable("timesheet_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  client_name: text("client_name"),
  period_year: integer("period_year").notNull(),
  period_month: integer("period_month").notNull(), // 1-12
  entry_date: date("entry_date").notNull(),
  hours: doublePrecision("hours").notNull().default(0),
  issue_key: text("issue_key"),
  issue_summary: text("issue_summary"),
  activity_type: text("activity_type"), // free text dari Jira, atau label auto-fill (Belum Diisi/Libur ...)
  is_empty: boolean("is_empty").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxUser: index("idx_timesheet_entries_user").on(t.user_id),
  idxUserDate: index("idx_timesheet_entries_user_date").on(t.user_id, t.entry_date),
}));

/**
 * Riwayat generate file .xlsx Timesheet (Converter) -- satu baris per kali
 * "Save & Generate" ditekan. File hasil generate disimpan lewat pola
 * attachments generik (source_type "timesheet_export", source_id = id baris
 * ini), bukan kolom url khusus, biar konsisten dengan dokumen lain.
 */
export const timesheetExports = pgTable("timesheet_exports", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  client_name: text("client_name"),
  period_year: integer("period_year").notNull(),
  period_month: integer("period_month").notNull(),
  total_hours: doublePrecision("total_hours").notNull().default(0),
  total_md: doublePrecision("total_md").notNull().default(0),
  generated_by_name: text("generated_by_name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxUser: index("idx_timesheet_exports_user").on(t.user_id),
}));

/**
 * Submission Timesheet ber-TTD client (bukti fisik/PDF hasil TTD client) --
 * terpisah dari flow generate di atas. Status cuma pill sederhana
 * review -> approved (bukan TTD Online). Talent submit punya sendiri,
 * Backoffice-PMO-full yang approve.
 */
export const timesheetSubmissions = pgTable("timesheet_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  client_name: text("client_name").notNull(),
  period_start: date("period_start").notNull(),
  period_end: date("period_end").notNull(),
  status_code: text("status_code").notNull().default("review"), // review | approved
  approved_at: timestamp("approved_at", { withTimezone: true }),
  approved_by_name: text("approved_by_name"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxUser: index("idx_timesheet_submissions_user").on(t.user_id),
}));

export const attendanceLogs = pgTable("attendance_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  work_date: date("work_date").notNull(),
  check_in_at: timestamp("check_in_at", { withTimezone: true }).notNull(),
  check_in_lat: doublePrecision("check_in_lat"),
  check_in_lng: doublePrecision("check_in_lng"),
  check_out_at: timestamp("check_out_at", { withTimezone: true }),
  check_out_lat: doublePrecision("check_out_lat"),
  check_out_lng: doublePrecision("check_out_lng"),
  check_in_photo_path: text("check_in_photo_path"),
  check_out_photo_path: text("check_out_photo_path"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Sengaja BUKAN unique per (user_id, work_date) -- 1 user bisa clock in/out
  // berkali-kali sehari (tiap klik bikin sesi baru), bukan 1 baris ditimpa.
  idxUser: index("idx_attendance_logs_user").on(t.user_id),
  idxUserWorkDate: index("idx_attendance_logs_user_work_date").on(t.user_id, t.work_date),
}));

export const leaveTypes = pgTable("leave_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  requires_file: boolean("requires_file").notNull().default(false),
  is_active: boolean("is_active").notNull().default(true),
  sort_order: smallint("sort_order").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Config approval chain GLOBAL buat Time Off, di-setup HR di
 * /hr/attendance-settings. Ini TEMPLATE yang di-snapshot ke tiap request baru
 * (lihat timeOffApprovalSteps) -- ubah config di sini TIDAK mengubah request
 * yang sudah pernah disubmit.
 */
export const attendanceApprovalSteps = pgTable("attendance_approval_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  step_order: smallint("step_order").notNull(),
  approver_user_id: uuid("approver_user_id").notNull().references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqStepOrder: uniqueIndex("uq_attendance_approval_steps_order").on(t.step_order),
}));

export const timeOffRequests = pgTable("time_off_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  leave_type_id: uuid("leave_type_id").notNull().references(() => leaveTypes.id),
  start_date: date("start_date").notNull(),
  end_date: date("end_date").notNull(),
  reason: text("reason"),
  delegate_user_id: uuid("delegate_user_id").references(() => users.id),
  status_code: text("status_code").notNull().default("pending"), // pending | approved | rejected | cancelled
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxUser: index("idx_time_off_requests_user").on(t.user_id),
}));

/** Snapshot approver per step SAAT SUBMIT -- lihat komentar attendanceApprovalSteps. */
export const timeOffApprovalSteps = pgTable("time_off_approval_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  request_id: uuid("request_id").notNull().references(() => timeOffRequests.id),
  step_order: smallint("step_order").notNull(),
  approver_user_id: uuid("approver_user_id").notNull().references(() => users.id),
  status_code: text("status_code").notNull().default("pending"), // pending | approved | rejected
  acted_at: timestamp("acted_at", { withTimezone: true }),
  notes: text("notes"),
}, (t) => ({
  idxRequest: index("idx_time_off_approval_steps_request").on(t.request_id),
}));

export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  division_key: text("division_key").notNull(), // marketing | sales | ta | hr | tm | pmo | finance | tasks | ttd
  action_type: text("action_type").notNull(), // create | update | delete
  entity_label: text("entity_label").notNull(),
  page_label: text("page_label"),
  actor_user_id: uuid("actor_user_id").references(() => users.id),
  actor_name: text("actor_name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxActorUser: index("idx_activity_logs_actor_user").on(t.actor_user_id),
}));

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  is_read: boolean("is_read").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxUser: index("idx_notifications_user").on(t.user_id),
}));

export const signatures = pgTable("signatures", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  image_path: text("image_path").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqUser: uniqueIndex("uq_signatures_user").on(t.user_id),
}));

export const signatureRequests = pgTable("signature_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  document_title: text("document_title").notNull(),
  document_url: text("document_url"),
  requested_by_user_id: uuid("requested_by_user_id").notNull().references(() => users.id),
  signer_user_id: uuid("signer_user_id").notNull().references(() => users.id),
  status_code: text("status_code").notNull().default("pending"), // pending | signed | rejected
  signed_at: timestamp("signed_at", { withTimezone: true }),
  reject_reason: text("reject_reason"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // --- Link generik ke approval journey entitas lain (mis. Extension Increment Request) ---
  source_type: text("source_type"), // e.g. "extension_increment_request"
  source_id: uuid("source_id"),
  step_code: text("step_code"), // e.g. requester | approval_1 | approval_2 | approval_3 | acknowledge
  step_order: smallint("step_order"),
}, (t) => ({
  idxRequestedBy: index("idx_signature_requests_requested_by").on(t.requested_by_user_id),
  idxSigner: index("idx_signature_requests_signer").on(t.signer_user_id),
  idxSource: index("idx_signature_requests_source").on(t.source_type, t.source_id),
}));

/**
 * Lampiran generik multi-file/link -- bisa dipakai entitas manapun lewat (source_type, source_id),
 * jadi satu record bisa punya banyak dokumen (upload ATAU link) tanpa perlu kolom *_url terpisah per file.
 */
export const attachments = pgTable("attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  source_type: text("source_type").notNull(),
  source_id: uuid("source_id").notNull(),
  kind: text("kind").notNull().default("file"), // file | link
  file_name: text("file_name").notNull(), // nama file asli, atau label link
  file_path: text("file_path"), // storage path -- null kalau kind=link
  link_url: text("link_url"), // URL eksternal -- null kalau kind=file
  uploaded_by_name: text("uploaded_by_name"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxSource: index("idx_attachments_source").on(t.source_type, t.source_id),
}));

/**
 * Feature Request Tracker -- tempat siapapun mengajukan penambahan fitur / bug fix /
 * improvement, lengkap dengan konteks yang mempermudah development, plus status
 * pipeline biar bisa dipantau progressnya.
 */
export const featureRequests = pgTable("feature_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  request_no: text("request_no").notNull(),
  title: text("title").notNull(),
  module_area_code: text("module_area_code"), // marketing|sales|ta|hr|tm|pmo|finance|executive|tasks|ttd|general
  request_type_code: text("request_type_code").notNull().default("new_feature"), // new_feature|bug_fix|improvement|data_fix|integration|other
  priority_code: text("priority_code").notNull().default("medium"), // low|medium|high|urgent
  status_code: text("status_code").notNull().default("new"), // new|under_review|approved|in_progress|testing|done|rejected|on_hold
  description: text("description").notNull(),
  current_behavior: text("current_behavior"),
  expected_behavior: text("expected_behavior"),
  business_impact: text("business_impact"),
  context_path: text("context_path"),
  release_sha: text("release_sha"),
  environment: text("environment"),
  acceptance_criteria: text("acceptance_criteria"),
  backlog_url: text("backlog_url"),
  delivered_release: text("delivered_release"),
  validation_notes: text("validation_notes"),
  requested_by_user_id: uuid("requested_by_user_id").references(() => users.id),
  requested_by_name: text("requested_by_name").notNull(),
  requested_by_email: text("requested_by_email"),
  target_date: date("target_date"),
  assigned_to_name: text("assigned_to_name"),
  resolution_notes: text("resolution_notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqRequestNo: uniqueIndex("uq_feature_requests_request_no").on(t.request_no),
  idxRequestedBy: index("idx_feature_requests_requested_by").on(t.requested_by_user_id),
}));

/**
 * School / LMS -- pembelajaran materi & silabus untuk talent, dikelola oleh
 * divisi "school" (instruktur/admin) atau Owner. Learner enroll ke course,
 * jalan per modul/lesson (video/dokumen/teks), kerjain quiz, dan dapat
 * sertifikat otomatis begitu course-nya selesai 100%.
 */
export const schoolCourses = pgTable("school_courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  course_no: text("course_no").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  status_code: text("status_code").notNull().default("draft"), // draft | published | archived
  passing_score_percent: integer("passing_score_percent").notNull().default(70),
  estimated_duration_minutes: integer("estimated_duration_minutes"),
  cover_image_url: text("cover_image_url"),
  created_by_name: text("created_by_name"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqCourseNo: uniqueIndex("uq_school_courses_course_no").on(t.course_no),
}));

export const schoolModules = pgTable("school_modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  course_id: uuid("course_id").notNull().references(() => schoolCourses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxCourse: index("idx_school_modules_course").on(t.course_id),
}));

export const schoolLessons = pgTable("school_lessons", {
  id: uuid("id").defaultRandom().primaryKey(),
  module_id: uuid("module_id").notNull().references(() => schoolModules.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content_type_code: text("content_type_code").notNull().default("text"), // video | document | text | quiz
  video_url: text("video_url"),
  text_content: text("text_content"),
  position: integer("position").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxModule: index("idx_school_lessons_module").on(t.module_id),
}));

export const schoolQuizzes = pgTable("school_quizzes", {
  id: uuid("id").defaultRandom().primaryKey(),
  lesson_id: uuid("lesson_id").notNull().references(() => schoolLessons.id, { onDelete: "cascade" }),
  passing_score_percent: integer("passing_score_percent").notNull().default(70),
  time_limit_minutes: integer("time_limit_minutes"),
}, (t) => ({
  uqLesson: uniqueIndex("uq_school_quizzes_lesson").on(t.lesson_id),
}));

export const schoolQuizQuestions = pgTable("school_quiz_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  quiz_id: uuid("quiz_id").notNull().references(() => schoolQuizzes.id, { onDelete: "cascade" }),
  question_text: text("question_text").notNull(),
  position: integer("position").notNull().default(0),
  points: integer("points").notNull().default(1),
}, (t) => ({
  idxQuiz: index("idx_school_quiz_questions_quiz").on(t.quiz_id),
}));

export const schoolQuizOptions = pgTable("school_quiz_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  question_id: uuid("question_id").notNull().references(() => schoolQuizQuestions.id, { onDelete: "cascade" }),
  option_text: text("option_text").notNull(),
  is_correct: boolean("is_correct").notNull().default(false),
  position: integer("position").notNull().default(0),
}, (t) => ({
  idxQuestion: index("idx_school_quiz_options_question").on(t.question_id),
}));

export const schoolEnrollments = pgTable("school_enrollments", {
  id: uuid("id").defaultRandom().primaryKey(),
  course_id: uuid("course_id").notNull().references(() => schoolCourses.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  enrolled_at: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  status_code: text("status_code").notNull().default("in_progress"), // in_progress | completed
  completed_at: timestamp("completed_at", { withTimezone: true }),
  certificate_no: text("certificate_no"),
  certificate_issued_at: timestamp("certificate_issued_at", { withTimezone: true }),
}, (t) => ({
  uqCourseUser: uniqueIndex("uq_school_enrollments_course_user").on(t.course_id, t.user_id),
  idxUser: index("idx_school_enrollments_user").on(t.user_id),
}));

export const schoolLessonProgress = pgTable("school_lesson_progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  enrollment_id: uuid("enrollment_id").notNull().references(() => schoolEnrollments.id, { onDelete: "cascade" }),
  lesson_id: uuid("lesson_id").notNull().references(() => schoolLessons.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  score_percent: integer("score_percent"),
  passed: boolean("passed"),
  attempt_count: integer("attempt_count").notNull().default(0),
}, (t) => ({
  uqEnrollmentLesson: uniqueIndex("uq_school_lesson_progress_enrollment_lesson").on(t.enrollment_id, t.lesson_id),
  idxUser: index("idx_school_lesson_progress_user").on(t.user_id),
  idxLesson: index("idx_school_lesson_progress_lesson").on(t.lesson_id),
}));

export const kanbanTasks = pgTable("kanban_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  task_no: text("task_no").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status_code: text("status_code").notNull().default("todo"), // backlog | todo | in_progress | in_review | done
  priority_code: text("priority_code").notNull().default("medium"), // low | medium | high | urgent
  assignee_name: text("assignee_name"),
  start_date: date("start_date"),
  due_date: date("due_date"),
  position: integer("position").notNull().default(0),
  parent_id: uuid("parent_id").references((): AnyPgColumn => kanbanTasks.id),
  tags: text("tags").array(), // label bebas per task, warna ditentukan otomatis dari hash nama tag (bukan disimpan)
  created_by_name: text("created_by_name"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqTaskNo: uniqueIndex("uq_kanban_tasks_task_no").on(t.task_no),
  idxParent: index("idx_kanban_tasks_parent").on(t.parent_id),
}));

export const kanbanTaskComments = pgTable("kanban_task_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  task_id: uuid("task_id").notNull().references(() => kanbanTasks.id),
  author_name: text("author_name").notNull(),
  body: text("body").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxTask: index("idx_kanban_task_comments_task").on(t.task_id),
}));

export const googleTokens = pgTable("google_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id),
  access_token: text("access_token").notNull(),
  refresh_token: text("refresh_token"),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqUser: uniqueIndex("uq_google_tokens_user").on(t.user_id),
}));

export const sheetConnections = pgTable("sheet_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  division_key: text("division_key").notNull(),
  spreadsheet_id: text("spreadsheet_id").notNull(),
  spreadsheet_url: text("spreadsheet_url").notNull(),
  sheet_name: text("sheet_name").notNull().default("Sheet1"),
  connected_by_user_id: uuid("connected_by_user_id").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  column_mapping: text("column_mapping"), // JSON: { "Nama Kolom Sheet": "field_erp" }
}, (t) => ({
  uqDivision: uniqueIndex("uq_sheet_connections_division").on(t.division_key),
  idxConnectedBy: index("idx_sheet_connections_connected_by").on(t.connected_by_user_id),
}));

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Overtime, Ganti Hari, Business Trip, Reimbursement, Medical Claim, MCU, Cash
 * Advance -- kolaborasi 4 divisi: PMO (input & tracking), Sales (forward &
 * konfirmasi ke client), Finance (invoice ke client), HR (pencairan ke talent).
 * Struktur field mengikuti "TM - Talent Delivery Report.xlsx".
 */
export const overtimeBusinessTripClaims = pgTable("overtime_business_trip_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  claim_no: text("claim_no").notNull(),
  opportunity_id: uuid("opportunity_id").references(() => opportunities.id),
  employee_id: uuid("employee_id").references(() => employees.id),
  claim_type_code: text("claim_type_code").notNull(), // overtime | ganti_hari | business_trip | reimbursement | medical_claim | mcu | cash_advance
  claim_title: text("claim_title").notNull(),
  days_count: integer("days_count"),
  start_date: date("start_date"),
  end_date: date("end_date"),
  duration_hours_client: integer("duration_hours_client"),
  duration_hours_pmo_basic: integer("duration_hours_pmo_basic"),
  duration_hours_payroll: integer("duration_hours_payroll"),
  spk_url: text("spk_url"),
  timesheet_url: text("timesheet_url"),
  draft_timesheet_url: text("draft_timesheet_url"),
  pq_submit_date: date("pq_submit_date"),
  pq_status_code: text("pq_status_code"), // not_started | on_progress | done
  po_status_code: text("po_status_code"),
  cr_status_code: text("cr_status_code"),
  pic_1_name: text("pic_1_name"),

  amount_given_to_talent_initial: integer("amount_given_to_talent_initial"),
  given_to_talent_initial_date: date("given_to_talent_initial_date"),
  amount_claim_to_client_total: integer("amount_claim_to_client_total"),
  amount_bt_medical_to_client: integer("amount_bt_medical_to_client"),
  amount_uang_saku_celerates: integer("amount_uang_saku_celerates"),
  amount_transport: integer("amount_transport"),
  amount_over_bagasi: integer("amount_over_bagasi"),
  amount_etc: integer("amount_etc"),

  pic_2_name: text("pic_2_name"),
  talent_payment_date: date("talent_payment_date"),
  amount_total_given_to_talent: integer("amount_total_given_to_talent"),
  talent_payment_status_code: text("talent_payment_status_code").notNull().default("pending"), // pending | done | hold

  invoice_no: text("invoice_no"),
  amount_total_billed_to_client: integer("amount_total_billed_to_client"),
  billing_status_code: text("billing_status_code").notNull().default("not_started"), // not_started | on_progress | done

  status_code: text("status_code").notNull().default("draft"), // draft | forwarded_to_sales | submitted_to_finance | invoiced
  notes: text("notes"),
  created_by_name: text("created_by_name"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqClaimNo: uniqueIndex("uq_overtime_business_trip_claims_claim_no").on(t.claim_no),
  idxOpportunity: index("idx_overtime_business_trip_claims_opportunity").on(t.opportunity_id),
  idxEmployee: index("idx_overtime_business_trip_claims_employee").on(t.employee_id),
}));

/**
 * Profitability Tracker (kolaborasi Sales x TM x PMO) -- satu baris per
 * talent per bulan, snapshot Price/COGS/margin. Nggak ada histori bulanan
 * Price/COGS di tabel manapun sebelum ini (talent_assignments cuma nyimpen
 * nilai TERKINI), jadi tabel ini sengaja denormalized (nyimpen talent_name/
 * client_name/role sebagai teks, bukan cuma FK) supaya laporan bulan lama
 * tetap solid walau data master di talent_assignments berubah belakangan.
 * Diisi lewat "Sync dari Talents Book" (src/app/sales/profitability-tracker/actions.ts),
 * yang meng-upsert 1 baris per talent_assignment per bulan dari data yang
 * sudah ada saat itu (idempotent lewat unique index di bawah).
 */
export const profitabilityEntries = pgTable("profitability_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  talent_assignment_id: uuid("talent_assignment_id").notNull().references(() => talentAssignments.id),
  employee_id: uuid("employee_id").references(() => employees.id),
  talent_name: text("talent_name").notNull(),
  client_name: text("client_name").notNull(),
  role: text("role"),
  period_year: integer("period_year").notNull(),
  period_month: integer("period_month").notNull(), // 1-12
  price_amount: integer("price_amount").notNull().default(0),
  cogs_amount: integer("cogs_amount").notNull().default(0),
  margin_amount: integer("margin_amount").notNull().default(0), // price - cogs
  margin_percent: doublePrecision("margin_percent").notNull().default(0),
  generated_by_name: text("generated_by_name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqTalentPeriod: uniqueIndex("uq_profitability_entries_talent_period").on(t.talent_assignment_id, t.period_year, t.period_month),
  idxClientName: index("idx_profitability_entries_client_name").on(t.client_name),
  idxRole: index("idx_profitability_entries_role").on(t.role),
  idxPeriod: index("idx_profitability_entries_period").on(t.period_year, t.period_month),
}));

/**
 * Modul Automasi & Chatbot -- fondasi non-AI (reminder & document generator).
 * Channel reminder dibuat channel-agnostic dari awal ("email" aktif sekarang,
 * "wa_number"/"wa_group" disiapkan tapi belum ada provider-nya -- lihat
 * src/lib/automation/channels/whatsapp.ts) supaya WA tinggal di-plug nanti
 * tanpa ubah skema atau UI.
 */
export const automationReminders = pgTable("automation_reminders", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull(), // "absensi" | "timesheet"
  name: text("name").notNull(),
  message_template: text("message_template").notNull(), // freetext, support placeholder {{tanggal}}
  schedule_day_of_week: integer("schedule_day_of_week"), // 0=Minggu..6=Sabtu, null = manual only
  schedule_time: text("schedule_time"), // "HH:mm", disimpan buat persiapan cron -- belum dieksekusi otomatis
  is_active: boolean("is_active").notNull().default(true),
  created_by_user_id: uuid("created_by_user_id").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationReminderRecipients = pgTable("automation_reminder_recipients", {
  id: uuid("id").defaultRandom().primaryKey(),
  reminder_id: uuid("reminder_id").notNull().references(() => automationReminders.id),
  channel: text("channel").notNull(), // "email" | "wa_number" | "wa_group"
  target: text("target").notNull(), // alamat email, atau nomor/id grup WA nanti
  label: text("label"),
}, (t) => ({
  idxReminder: index("idx_automation_reminder_recipients_reminder").on(t.reminder_id),
}));

export const automationReminderLogs = pgTable("automation_reminder_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  reminder_id: uuid("reminder_id").notNull().references(() => automationReminders.id),
  channel: text("channel").notNull(),
  target: text("target").notNull(),
  status: text("status").notNull(), // "sent" | "failed"
  error_message: text("error_message"),
  sent_at: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxReminder: index("idx_automation_reminder_logs_reminder").on(t.reminder_id),
}));

export const automationDocumentTemplates = pgTable("automation_document_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull(), // "contract" | "offering"
  name: text("name").notNull(),
  storage_path: text("storage_path").notNull(),
  uploaded_by_user_id: uuid("uploaded_by_user_id").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationGeneratedDocuments = pgTable("automation_generated_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  template_id: uuid("template_id").notNull().references(() => automationDocumentTemplates.id),
  onboarding_request_id: uuid("onboarding_request_id").notNull().references(() => onboardingRequests.id),
  storage_path: text("storage_path").notNull(),
  generated_by_user_id: uuid("generated_by_user_id").references(() => users.id),
  generated_at: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxOnboarding: index("idx_automation_generated_documents_onboarding").on(t.onboarding_request_id),
}));

/**
 * CRM Account -- sub-modul kolaborasi Sales & Marketing. `name` dicocokkan
 * (exact match, bukan FK) ke client_name di leads/opportunities/sales_opportunity_trackers
 * supaya nggak perlu ubah tabel-tabel yang sudah ada sama sekali.
 */
export const crmClients = pgTable("crm_clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  industry: text("industry"),
  status_code: text("status_code").notNull().default("prospect"), // active | prospect | dormant
  notes: text("notes"),
  created_by_name: text("created_by_name"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqName: uniqueIndex("uq_crm_clients_name").on(t.name),
}));

export const crmClientContacts = pgTable("crm_client_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  client_id: uuid("client_id").notNull().references(() => crmClients.id),
  name: text("name").notNull(),
  role_title: text("role_title"),
  email: text("email"),
  phone: text("phone"),
  is_primary: boolean("is_primary").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxClient: index("idx_crm_client_contacts_client").on(t.client_id),
}));

export const crmClientActivities = pgTable("crm_client_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  client_id: uuid("client_id").notNull().references(() => crmClients.id),
  contact_id: uuid("contact_id").references(() => crmClientContacts.id),
  type_code: text("type_code").notNull(), // call | email | meeting | note
  title: text("title").notNull(),
  description: text("description"),
  activity_date: date("activity_date").notNull(),
  created_by_name: text("created_by_name"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxClient: index("idx_crm_client_activities_client").on(t.client_id),
}));