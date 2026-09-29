CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_key" text NOT NULL,
	"action_type" text NOT NULL,
	"entity_label" text NOT NULL,
	"page_label" text,
	"actor_user_id" uuid,
	"actor_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_date" date DEFAULT now() NOT NULL,
	"requisition_id" uuid,
	"candidate_id" uuid,
	"level_code" text,
	"ta_pic_name" text NOT NULL,
	"cv_asli_url" text,
	"cv_celerates_url" text,
	"candidate_source_code" text,
	"notes" text,
	"price_amount" integer,
	"hiring_status_code" text DEFAULT 'cv_sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_submission_status_code" text,
	"client_submission_updated_at" timestamp with time zone,
	"client_submission_updated_by_name" text,
	"client_submission_note" text
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"kind" text DEFAULT 'file' NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text,
	"link_url" text,
	"uploaded_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_order" smallint NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"check_in_at" timestamp with time zone NOT NULL,
	"check_in_lat" double precision,
	"check_in_lng" double precision,
	"check_out_at" timestamp with time zone,
	"check_out_lat" double precision,
	"check_out_lng" double precision,
	"check_in_photo_path" text,
	"check_out_photo_path" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"storage_path" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_generated_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"onboarding_request_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"generated_by_user_id" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_reminder_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_reminder_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "automation_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"message_template" text NOT NULL,
	"schedule_day_of_week" integer,
	"schedule_time" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bpjs_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"scheme" text NOT NULL,
	"company_no" text,
	"status_code" text,
	"due_month" date,
	"deduction_start_month" date,
	"registered_date" date,
	"card_sent_date" date,
	"active_month" date,
	"sipp_active_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_no" text NOT NULL,
	"candidate_date" date DEFAULT now() NOT NULL,
	"candidate_name" text NOT NULL,
	"position_name" text,
	"level_code" text,
	"wa_number" text,
	"email" text,
	"current_salary_amount" integer,
	"expected_salary_amount" integer,
	"ta_pic_name" text NOT NULL,
	"cv_asli_url" text,
	"candidate_source_code" text,
	"notes" text,
	"candidate_open_status_code" text,
	"cv_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "company_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_client_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid,
	"type_code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"activity_date" date NOT NULL,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role_title" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"status_code" text DEFAULT 'prospect' NOT NULL,
	"notes" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_request_id" uuid,
	"employee_no" text NOT NULL,
	"employee_category_code" text,
	"job_level_code" text,
	"position_name" text,
	"company_email" text,
	"join_date" date,
	"gender_code" text,
	"religion_code" text,
	"marital_status_changed_date" date,
	"ptkp_code" text,
	"ptkp_effective_year" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employment_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"parent_contract_id" uuid,
	"contract_no" text NOT NULL,
	"addendum_seq" smallint,
	"document_date" date,
	"signed_date" date,
	"start_date" date NOT NULL,
	"end_date" date,
	"duration_months" integer,
	"employment_type_code" text NOT NULL,
	"sk_no" text,
	"sk_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_increment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"requisition_id" uuid,
	"pq_tracker_id" uuid,
	"propose_start_date" date,
	"propose_end_date" date,
	"proposed_position_name" text,
	"proposed_grade_level_code" text,
	"proposed_employment_type_code" text,
	"proposed_basic_salary_amount" integer,
	"proposed_transport_allowance_amount" integer,
	"proposed_project_allowance_amount" integer,
	"proposed_accommodation_allowance_amount" integer,
	"proposed_overtime_allowance_amount" integer,
	"proposed_increment_amount_deal" integer,
	"proposed_increment_percent_deal" integer,
	"requester_name" text NOT NULL,
	"approved_by_1_name" text,
	"approved_by_2_name" text,
	"approved_by_3_name" text,
	"acknowledged_by_name" text,
	"status_code" text DEFAULT 'pending' NOT NULL,
	"hr_status_code" text DEFAULT 'waiting_hr' NOT NULL,
	"employment_contract_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requester_user_id" uuid,
	"approver_1_user_id" uuid,
	"approver_2_user_id" uuid,
	"approver_3_user_id" uuid,
	"acknowledger_user_id" uuid,
	"owner_override" boolean DEFAULT false NOT NULL,
	"owner_override_by_name" text,
	"owner_override_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "extension_request_special_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extension_request_id" uuid NOT NULL,
	"category_code" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"note_text" text NOT NULL,
	"effective_date" date,
	"status_code" text DEFAULT 'open' NOT NULL,
	"created_by_name" text NOT NULL,
	"created_by_division" text NOT NULL,
	"acknowledged_by_name" text,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_no" text NOT NULL,
	"title" text NOT NULL,
	"module_area_code" text,
	"request_type_code" text DEFAULT 'new_feature' NOT NULL,
	"priority_code" text DEFAULT 'medium' NOT NULL,
	"status_code" text DEFAULT 'new' NOT NULL,
	"description" text NOT NULL,
	"current_behavior" text,
	"expected_behavior" text,
	"business_impact" text,
	"requested_by_user_id" uuid,
	"requested_by_name" text NOT NULL,
	"requested_by_email" text,
	"target_date" date,
	"assigned_to_name" text,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_document_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"doc_url" text,
	"status_code" text DEFAULT 'pending' NOT NULL,
	"notified_at" timestamp with time zone,
	"notified_by_name" text,
	"notes" text,
	"received_at" timestamp with time zone,
	"received_by_name" text,
	"finance_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_no" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status_code" text DEFAULT 'todo' NOT NULL,
	"priority_code" text DEFAULT 'medium' NOT NULL,
	"assignee_name" text,
	"start_date" date,
	"due_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"parent_id" uuid,
	"tags" text[],
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_no" text NOT NULL,
	"client_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"company_size" integer,
	"industry_code" text,
	"service_type_code" text NOT NULL,
	"lead_source_code" text NOT NULL,
	"category_code" text NOT NULL,
	"sales_pic_name" text NOT NULL,
	"notes" text,
	"is_qualified" boolean,
	"disqualify_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_name" text,
	"price_amount" integer,
	"price_period_code" text,
	"position_name" text,
	"headcount_target" integer,
	"level_code" text,
	"estimated_duration_months" integer,
	CONSTRAINT "ck_leads_disqualify_reason" CHECK (("leads"."is_qualified" IS DISTINCT FROM false) OR (length("leads"."disqualify_reason") >= 10))
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"requires_file" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid,
	"requisition_id" uuid,
	"ta_pic_name" text NOT NULL,
	"salary_deal_amount" integer,
	"offering_letter_path" text,
	"employee_status_code" text,
	"start_date" date,
	"end_date" date,
	"needs_laptop" boolean DEFAULT false NOT NULL,
	"needs_id_card" boolean DEFAULT false NOT NULL,
	"nik" text,
	"birth_place" text,
	"birth_date" date,
	"id_card_address" text,
	"current_address" text,
	"education_level_code" text,
	"institution_name" text,
	"major" text,
	"gpa" text,
	"personal_email" text,
	"personal_phone" text,
	"npwp" text,
	"family_card_no" text,
	"marital_status_code" text,
	"dependent_count" integer,
	"bank_account_no" text,
	"bank_name" text,
	"bank_account_holder_name" text,
	"bank_branch_name" text,
	"bpjs_kesehatan_personal_no" text,
	"bpjs_kesehatan_willing_transfer" boolean,
	"bpjs_ketenagakerjaan_personal_no" text,
	"emergency_contact_name" text,
	"emergency_contact_relationship" text,
	"emergency_contact_phone" text,
	"available_start_date" date,
	"mother_maiden_name" text,
	"blood_type_code" text,
	"employment_type_code" text,
	"employee_category_code" text,
	"job_level_code" text,
	"company_email" text,
	"gender_code" text,
	"religion_code" text,
	"ptkp_code" text,
	"ktp_file_path" text,
	"bpjs_kesehatan_file_path" text,
	"bpjs_ketenagakerjaan_file_path" text,
	"npwp_file_path" text,
	"kk_file_path" text,
	"diploma_file_path" text,
	"certification_file_path" text,
	"formal_photo_file_path" text,
	"price_amount" integer,
	"basic_salary_amount" integer,
	"functional_allowance_amount" integer,
	"transport_allowance_amount" integer,
	"project_allowance_amount" integer,
	"accommodation_allowance_amount" integer,
	"field_allowance_amount" integer,
	"overtime_allowance_amount" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"opportunity_tracker_id" uuid,
	"onboarding_request_id" uuid,
	"opty_no" text NOT NULL,
	"opty_request_date" date,
	"pq_no" text,
	"client_name" text NOT NULL,
	"client_type_code" text,
	"project_name" text NOT NULL,
	"position_name" text,
	"service_type_code" text NOT NULL,
	"business_unit_code" text,
	"level_code" text,
	"headcount_target" integer,
	"priority_code" text,
	"bant_score" smallint,
	"price_amount" integer,
	"price_period_code" text,
	"estimated_duration_months" integer,
	"approval_date" date,
	"po_doc_url" text,
	"sales_pic_name" text NOT NULL,
	"pipeline_stage_code" text DEFAULT 'on_going' NOT NULL,
	"opty_status_code" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"start_date" date,
	"end_date" date
);
--> statement-breakpoint
CREATE TABLE "overtime_business_trip_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_no" text NOT NULL,
	"opportunity_id" uuid,
	"employee_id" uuid,
	"claim_type_code" text NOT NULL,
	"claim_title" text NOT NULL,
	"days_count" integer,
	"start_date" date,
	"end_date" date,
	"duration_hours_client" integer,
	"duration_hours_pmo_basic" integer,
	"duration_hours_payroll" integer,
	"spk_url" text,
	"timesheet_url" text,
	"draft_timesheet_url" text,
	"pq_submit_date" date,
	"pq_status_code" text,
	"po_status_code" text,
	"cr_status_code" text,
	"pic_1_name" text,
	"amount_given_to_talent_initial" integer,
	"given_to_talent_initial_date" date,
	"amount_claim_to_client_total" integer,
	"amount_bt_medical_to_client" integer,
	"amount_uang_saku_celerates" integer,
	"amount_transport" integer,
	"amount_over_bagasi" integer,
	"amount_etc" integer,
	"pic_2_name" text,
	"talent_payment_date" date,
	"amount_total_given_to_talent" integer,
	"talent_payment_status_code" text DEFAULT 'pending' NOT NULL,
	"invoice_no" text,
	"amount_total_billed_to_client" integer,
	"billing_status_code" text DEFAULT 'not_started' NOT NULL,
	"status_code" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profitability_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"talent_assignment_id" uuid NOT NULL,
	"employee_id" uuid,
	"talent_name" text NOT NULL,
	"client_name" text NOT NULL,
	"role" text,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"price_amount" integer DEFAULT 0 NOT NULL,
	"cogs_amount" integer DEFAULT 0 NOT NULL,
	"margin_amount" integer DEFAULT 0 NOT NULL,
	"margin_percent" double precision DEFAULT 0 NOT NULL,
	"generated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"monthly_value_amount" integer,
	"total_value_amount" integer,
	"contract_duration_months" integer,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sales_type_code" text
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"project_details" text,
	"pq_price" integer,
	"pq_total" integer,
	"pks_no" text,
	"pks_url" text,
	"pks_status_code" text,
	"po_start_date" date,
	"po_end_date" date,
	"po_no" text,
	"po_url" text,
	"po_status_code" text,
	"cr_no" text,
	"cr_url" text,
	"cr_status_code" text,
	"other_doc_no" text,
	"other_doc_url" text,
	"other_doc_status_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sales_type_code" text
);
--> statement-breakpoint
CREATE TABLE "project_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"invoice_plan_date" date,
	"group_name" text,
	"services_month_start" date,
	"price_per_month" integer,
	"status_code" text,
	"bast_support_doc_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issue_code" text,
	"submit_bast_date" date
);
--> statement-breakpoint
CREATE TABLE "project_monthly_billings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"month" date NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_no" text NOT NULL,
	"opportunity_id" uuid,
	"opty_request_date" date,
	"client_name" text NOT NULL,
	"position_name" text NOT NULL,
	"service_type_code" text,
	"level_code" text,
	"opty_status_code" text,
	"headcount_target" integer DEFAULT 1 NOT NULL,
	"priority_code" text DEFAULT 'p2' NOT NULL,
	"price_amount" integer,
	"estimated_duration_months" integer,
	"ta_pic_name" text NOT NULL,
	"sales_pic_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_opportunity_trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"opty_no" text NOT NULL,
	"sales_qualified" boolean DEFAULT false NOT NULL,
	"client_name" text NOT NULL,
	"service_type_code" text,
	"requirement_summary" text,
	"opty_status_code" text DEFAULT 'cv_submission' NOT NULL,
	"progress_notes" text,
	"estimated_deal_amount" integer,
	"detail_requirement" text,
	"client_type_code" text,
	"sales_pic_name" text NOT NULL,
	"last_communication_date" date,
	"bante_score" smallint,
	"dropped_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"position_name" text,
	"level_code" text,
	"headcount_target" integer,
	"price_amount" integer,
	"price_period_code" text,
	"estimated_duration_months" integer
);
--> statement-breakpoint
CREATE TABLE "school_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_no" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"status_code" text DEFAULT 'draft' NOT NULL,
	"passing_score_percent" integer DEFAULT 70 NOT NULL,
	"estimated_duration_minutes" integer,
	"cover_image_url" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_code" text DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp with time zone,
	"certificate_no" text,
	"certificate_issued_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "school_lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"score_percent" integer,
	"passed" boolean,
	"attempt_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content_type_code" text DEFAULT 'text' NOT NULL,
	"video_url" text,
	"text_content" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_quiz_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"option_text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"passing_score_percent" integer DEFAULT 70 NOT NULL,
	"time_limit_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "sheet_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_key" text NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"spreadsheet_url" text NOT NULL,
	"sheet_name" text DEFAULT 'Sheet1' NOT NULL,
	"connected_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"column_mapping" text
);
--> statement-breakpoint
CREATE TABLE "signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_title" text NOT NULL,
	"document_url" text,
	"requested_by_user_id" uuid NOT NULL,
	"signer_user_id" uuid NOT NULL,
	"status_code" text DEFAULT 'pending' NOT NULL,
	"signed_at" timestamp with time zone,
	"reject_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"step_code" text,
	"step_order" smallint
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"image_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"requisition_id" uuid,
	"start_date" date,
	"end_date" date,
	"status_code" text,
	"talent_track_code" text,
	"increment_date" date,
	"current_grading" text,
	"current_salary_grade_code" text,
	"price_amount" integer,
	"current_skill" text,
	"current_certification" text,
	"performance_appraisal_result" text,
	"performance_review_result" text,
	"people_summarize" text,
	"increment_amount_deal" integer,
	"increment_percent_deal" integer,
	"status_all_data_code" text,
	"notes" text,
	"basic_salary_amount" integer,
	"functional_allowance_amount" integer,
	"transport_allowance_amount" integer,
	"project_allowance_amount" integer,
	"accommodation_allowance_amount" integer,
	"field_allowance_amount" integer,
	"overtime_allowance_amount" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pq_tracker_id" uuid,
	"tax_bruto_amount" integer,
	"gross_salary_amount" integer,
	"take_home_pay_amount" integer,
	"kompensasi_amount" integer,
	"thr_allowance_amount" integer,
	"annual_bonus_allowance_amount" integer,
	"annual_medical_reimbursement_amount" integer,
	"laptop_ownership_amount" integer,
	"training_amount" integer,
	"refreshment_amount" integer,
	"bpjs_kesehatan_company_amount" integer,
	"jkk_amount" integer,
	"jkm_amount" integer,
	"jht_company_amount" integer,
	"jkp_amount" integer,
	"jp_company_amount" integer,
	"bpjs_kesehatan_employee_amount" integer,
	"jht_employee_amount" integer,
	"jp_employee_amount" integer,
	"management_fee_amount" integer,
	"total_cogs_amount" integer
);
--> statement-breakpoint
CREATE TABLE "time_off_approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"step_order" smallint NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"status_code" text DEFAULT 'pending' NOT NULL,
	"acted_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "time_off_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"delegate_user_id" uuid,
	"status_code" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_name" text,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"entry_date" date NOT NULL,
	"hours" double precision DEFAULT 0 NOT NULL,
	"issue_key" text,
	"issue_summary" text,
	"activity_type" text,
	"is_empty" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheet_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_name" text,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"total_hours" double precision DEFAULT 0 NOT NULL,
	"total_md" double precision DEFAULT 0 NOT NULL,
	"generated_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheet_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_name" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status_code" text DEFAULT 'review' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"level" text NOT NULL,
	"granted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role_title" text,
	"password_hash" text,
	"google_sub" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"requested_division_id" uuid,
	"account_type" text DEFAULT 'backoffice' NOT NULL,
	"can_use_timesheet_converter" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_approval_steps" ADD CONSTRAINT "attendance_approval_steps_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_document_templates" ADD CONSTRAINT "automation_document_templates_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_generated_documents" ADD CONSTRAINT "automation_generated_documents_template_id_automation_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."automation_document_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_generated_documents" ADD CONSTRAINT "automation_generated_documents_onboarding_request_id_onboarding_requests_id_fk" FOREIGN KEY ("onboarding_request_id") REFERENCES "public"."onboarding_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_generated_documents" ADD CONSTRAINT "automation_generated_documents_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_reminder_logs" ADD CONSTRAINT "automation_reminder_logs_reminder_id_automation_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."automation_reminders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_reminder_recipients" ADD CONSTRAINT "automation_reminder_recipients_reminder_id_automation_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."automation_reminders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_reminders" ADD CONSTRAINT "automation_reminders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bpjs_registrations" ADD CONSTRAINT "bpjs_registrations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_client_activities" ADD CONSTRAINT "crm_client_activities_client_id_crm_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."crm_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_client_activities" ADD CONSTRAINT "crm_client_activities_contact_id_crm_client_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_client_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_client_contacts" ADD CONSTRAINT "crm_client_contacts_client_id_crm_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."crm_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_onboarding_request_id_onboarding_requests_id_fk" FOREIGN KEY ("onboarding_request_id") REFERENCES "public"."onboarding_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_parent_contract_id_employment_contracts_id_fk" FOREIGN KEY ("parent_contract_id") REFERENCES "public"."employment_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_increment_requests" ADD CONSTRAINT "extension_increment_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_increment_requests" ADD CONSTRAINT "extension_increment_requests_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_increment_requests" ADD CONSTRAINT "extension_increment_requests_pq_tracker_id_opportunities_id_fk" FOREIGN KEY ("pq_tracker_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_increment_requests" ADD CONSTRAINT "extension_increment_requests_employment_contract_id_employment_contracts_id_fk" FOREIGN KEY ("employment_contract_id") REFERENCES "public"."employment_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_increment_requests" ADD CONSTRAINT "extension_increment_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_increment_requests" ADD CONSTRAINT "extension_increment_requests_approver_1_user_id_users_id_fk" FOREIGN KEY ("approver_1_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_increment_requests" ADD CONSTRAINT "extension_increment_requests_approver_2_user_id_users_id_fk" FOREIGN KEY ("approver_2_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_increment_requests" ADD CONSTRAINT "extension_increment_requests_approver_3_user_id_users_id_fk" FOREIGN KEY ("approver_3_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_increment_requests" ADD CONSTRAINT "extension_increment_requests_acknowledger_user_id_users_id_fk" FOREIGN KEY ("acknowledger_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_request_special_notes" ADD CONSTRAINT "extension_request_special_notes_extension_request_id_extension_increment_requests_id_fk" FOREIGN KEY ("extension_request_id") REFERENCES "public"."extension_increment_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_document_handoffs" ADD CONSTRAINT "finance_document_handoffs_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_tokens" ADD CONSTRAINT "google_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_task_comments" ADD CONSTRAINT "kanban_task_comments_task_id_kanban_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."kanban_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD CONSTRAINT "kanban_tasks_parent_id_kanban_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."kanban_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_opportunity_tracker_id_sales_opportunity_trackers_id_fk" FOREIGN KEY ("opportunity_tracker_id") REFERENCES "public"."sales_opportunity_trackers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_onboarding_request_id_onboarding_requests_id_fk" FOREIGN KEY ("onboarding_request_id") REFERENCES "public"."onboarding_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_business_trip_claims" ADD CONSTRAINT "overtime_business_trip_claims_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_business_trip_claims" ADD CONSTRAINT "overtime_business_trip_claims_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_entries" ADD CONSTRAINT "profitability_entries_talent_assignment_id_talent_assignments_id_fk" FOREIGN KEY ("talent_assignment_id") REFERENCES "public"."talent_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profitability_entries" ADD CONSTRAINT "profitability_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_monthly_billings" ADD CONSTRAINT "project_monthly_billings_contract_id_project_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."project_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_opportunity_id_sales_opportunity_trackers_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sales_opportunity_trackers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity_trackers" ADD CONSTRAINT "sales_opportunity_trackers_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_course_id_school_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."school_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_enrollments" ADD CONSTRAINT "school_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_lesson_progress" ADD CONSTRAINT "school_lesson_progress_enrollment_id_school_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."school_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_lesson_progress" ADD CONSTRAINT "school_lesson_progress_lesson_id_school_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."school_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_lesson_progress" ADD CONSTRAINT "school_lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_lessons" ADD CONSTRAINT "school_lessons_module_id_school_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."school_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_modules" ADD CONSTRAINT "school_modules_course_id_school_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."school_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_quiz_options" ADD CONSTRAINT "school_quiz_options_question_id_school_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."school_quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_quiz_questions" ADD CONSTRAINT "school_quiz_questions_quiz_id_school_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."school_quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_quizzes" ADD CONSTRAINT "school_quizzes_lesson_id_school_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."school_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_connections" ADD CONSTRAINT "sheet_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_signer_user_id_users_id_fk" FOREIGN KEY ("signer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_assignments" ADD CONSTRAINT "talent_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_assignments" ADD CONSTRAINT "talent_assignments_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_assignments" ADD CONSTRAINT "talent_assignments_pq_tracker_id_opportunities_id_fk" FOREIGN KEY ("pq_tracker_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_approval_steps" ADD CONSTRAINT "time_off_approval_steps_request_id_time_off_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."time_off_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_approval_steps" ADD CONSTRAINT "time_off_approval_steps_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_delegate_user_id_users_id_fk" FOREIGN KEY ("delegate_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_exports" ADD CONSTRAINT "timesheet_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_submissions" ADD CONSTRAINT "timesheet_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_requested_division_id_divisions_id_fk" FOREIGN KEY ("requested_division_id") REFERENCES "public"."divisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_logs_actor_user" ON "activity_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_applications_requisition" ON "applications" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "idx_applications_candidate" ON "applications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_source" ON "attachments" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attendance_approval_steps_order" ON "attendance_approval_steps" USING btree ("step_order");--> statement-breakpoint
CREATE INDEX "idx_attendance_logs_user" ON "attendance_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_attendance_logs_user_work_date" ON "attendance_logs" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "idx_automation_generated_documents_onboarding" ON "automation_generated_documents" USING btree ("onboarding_request_id");--> statement-breakpoint
CREATE INDEX "idx_automation_reminder_logs_reminder" ON "automation_reminder_logs" USING btree ("reminder_id");--> statement-breakpoint
CREATE INDEX "idx_automation_reminder_recipients_reminder" ON "automation_reminder_recipients" USING btree ("reminder_id");--> statement-breakpoint
CREATE INDEX "idx_bpjs_registrations_employee" ON "bpjs_registrations" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_candidates_candidate_no" ON "candidates" USING btree ("candidate_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_company_holidays_date" ON "company_holidays" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_crm_client_activities_client" ON "crm_client_activities" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_crm_client_contacts_client" ON "crm_client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_crm_clients_name" ON "crm_clients" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_divisions_key" ON "divisions" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_employees_employee_no" ON "employees" USING btree ("employee_no");--> statement-breakpoint
CREATE INDEX "idx_employees_onboarding_request" ON "employees" USING btree ("onboarding_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_employment_contracts_contract_no" ON "employment_contracts" USING btree ("contract_no");--> statement-breakpoint
CREATE INDEX "idx_employment_contracts_employee" ON "employment_contracts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_extension_increment_requests_employee" ON "extension_increment_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_extension_increment_requests_requisition" ON "extension_increment_requests" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "idx_extension_increment_requests_employment_contract" ON "extension_increment_requests" USING btree ("employment_contract_id");--> statement-breakpoint
CREATE INDEX "idx_extension_increment_requests_pq_tracker" ON "extension_increment_requests" USING btree ("pq_tracker_id");--> statement-breakpoint
CREATE INDEX "idx_special_notes_extension_request" ON "extension_request_special_notes" USING btree ("extension_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_feature_requests_request_no" ON "feature_requests" USING btree ("request_no");--> statement-breakpoint
CREATE INDEX "idx_feature_requests_requested_by" ON "feature_requests" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_finance_document_handoffs_opportunity" ON "finance_document_handoffs" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_google_tokens_user" ON "google_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_kanban_task_comments_task" ON "kanban_task_comments" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_kanban_tasks_task_no" ON "kanban_tasks" USING btree ("task_no");--> statement-breakpoint
CREATE INDEX "idx_kanban_tasks_parent" ON "kanban_tasks" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_leads_lead_no" ON "leads" USING btree ("lead_no");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_onboarding_requests_candidate" ON "onboarding_requests" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_onboarding_requests_requisition" ON "onboarding_requests" USING btree ("requisition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_opportunities_opty_no" ON "opportunities" USING btree ("opty_no");--> statement-breakpoint
CREATE INDEX "idx_opportunities_lead" ON "opportunities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_opportunities_opportunity_tracker" ON "opportunities" USING btree ("opportunity_tracker_id");--> statement-breakpoint
CREATE INDEX "idx_opportunities_onboarding_request" ON "opportunities" USING btree ("onboarding_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_overtime_business_trip_claims_claim_no" ON "overtime_business_trip_claims" USING btree ("claim_no");--> statement-breakpoint
CREATE INDEX "idx_overtime_business_trip_claims_opportunity" ON "overtime_business_trip_claims" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "idx_overtime_business_trip_claims_employee" ON "overtime_business_trip_claims" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pics_name" ON "pics" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_profitability_entries_talent_period" ON "profitability_entries" USING btree ("talent_assignment_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "idx_profitability_entries_client_name" ON "profitability_entries" USING btree ("client_name");--> statement-breakpoint
CREATE INDEX "idx_profitability_entries_role" ON "profitability_entries" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_profitability_entries_period" ON "profitability_entries" USING btree ("period_year","period_month");--> statement-breakpoint
CREATE INDEX "idx_project_contracts_opportunity" ON "project_contracts" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "idx_project_documents_opportunity" ON "project_documents" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "idx_project_invoices_opportunity" ON "project_invoices" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "idx_project_monthly_billings_contract" ON "project_monthly_billings" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_requisitions_requisition_no" ON "requisitions" USING btree ("requisition_no");--> statement-breakpoint
CREATE INDEX "idx_requisitions_opportunity" ON "requisitions" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sales_opportunity_trackers_opty_no" ON "sales_opportunity_trackers" USING btree ("opty_no");--> statement-breakpoint
CREATE INDEX "idx_sales_opportunity_trackers_lead" ON "sales_opportunity_trackers" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_school_courses_course_no" ON "school_courses" USING btree ("course_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_school_enrollments_course_user" ON "school_enrollments" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_school_enrollments_user" ON "school_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_school_lesson_progress_enrollment_lesson" ON "school_lesson_progress" USING btree ("enrollment_id","lesson_id");--> statement-breakpoint
CREATE INDEX "idx_school_lesson_progress_user" ON "school_lesson_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_school_lesson_progress_lesson" ON "school_lesson_progress" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "idx_school_lessons_module" ON "school_lessons" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "idx_school_modules_course" ON "school_modules" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_school_quiz_options_question" ON "school_quiz_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_school_quiz_questions_quiz" ON "school_quiz_questions" USING btree ("quiz_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_school_quizzes_lesson" ON "school_quizzes" USING btree ("lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sheet_connections_division" ON "sheet_connections" USING btree ("division_key");--> statement-breakpoint
CREATE INDEX "idx_sheet_connections_connected_by" ON "sheet_connections" USING btree ("connected_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_signature_requests_requested_by" ON "signature_requests" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_signature_requests_signer" ON "signature_requests" USING btree ("signer_user_id");--> statement-breakpoint
CREATE INDEX "idx_signature_requests_source" ON "signature_requests" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_signatures_user" ON "signatures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_talent_assignments_employee" ON "talent_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_talent_assignments_requisition" ON "talent_assignments" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "idx_talent_assignments_pq_tracker" ON "talent_assignments" USING btree ("pq_tracker_id");--> statement-breakpoint
CREATE INDEX "idx_time_off_approval_steps_request" ON "time_off_approval_steps" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_time_off_requests_user" ON "time_off_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_timesheet_entries_user" ON "timesheet_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_timesheet_entries_user_date" ON "timesheet_entries" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "idx_timesheet_exports_user" ON "timesheet_exports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_timesheet_submissions_user" ON "timesheet_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_access_user_division" ON "user_access" USING btree ("user_id","division_id");--> statement-breakpoint
CREATE INDEX "idx_user_access_division" ON "user_access" USING btree ("division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_requested_division" ON "users" USING btree ("requested_division_id");