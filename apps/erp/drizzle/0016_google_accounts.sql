-- Sales Google Sheet Sync through a company Google account (QA 2026-10-09): an Owner connects the account once
-- (OAuth consent); its refresh token is kept sealed (AES-256-GCM, lib/google-sheets) and never leaves the server.
CREATE TABLE IF NOT EXISTS "google_accounts" (
  "purpose" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "refresh_token_enc" text NOT NULL,
  "scopes" text NOT NULL,
  "connected_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
