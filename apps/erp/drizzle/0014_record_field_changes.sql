-- Sales V2 (QA 2026-10-08): field-level edit history behind "View edit history". One row per changed field, written by
-- the Sales update actions (lib/field-history.ts). No foreign keys: history outlives both the record and the user.
CREATE TABLE IF NOT EXISTS "record_field_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "record_type" text NOT NULL,
  "record_id" uuid NOT NULL,
  "field" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "actor_user_id" uuid,
  "actor_name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_record_field_changes_record" ON "record_field_changes" USING btree ("record_type", "record_id", "created_at");
