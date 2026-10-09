-- Workflows (QA doc pages 18–19, 2026-10-09): automations a team switches on from templates (attendance and timesheet
-- reminders, scheduled sheet sync, stale deals). Each run is kept with its steps, so anyone can see what happened.
CREATE TABLE IF NOT EXISTS "workflows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "template" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "next_run_at" timestamp with time zone,
  "last_run_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_workflows_due" ON "workflows" ("enabled", "next_run_at");
CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "number" integer NOT NULL,
  "trigger" text NOT NULL,
  "status" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "summary" text,
  "error" text,
  CONSTRAINT "workflow_runs_number_unique" UNIQUE ("workflow_id", "number")
);
