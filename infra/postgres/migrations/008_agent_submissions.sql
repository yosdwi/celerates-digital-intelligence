-- One Agent surface (ADR-017). Free text the Agent understood as a correction of approved knowledge, or as feedback
-- on an earlier answer, is held here as the user's *draft* until they review and send it. Sent knowledge corrections
-- wait for a curator, who may turn one into a draft knowledge source (still approved separately) or close it.
-- Feature Requests and data corrections are not stored here: they are ERP-held proposals (ADR-010).
CREATE TABLE agent_submissions(
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  principal_sub text NOT NULL,
  principal_name text NOT NULL,
  intent text NOT NULL CHECK (intent IN ('knowledge_correction','agent_feedback')),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','cancelled','promoted','closed')),
  title text NOT NULL,
  body text NOT NULL,
  refs jsonb NOT NULL DEFAULT '[]',
  subject_run_id text REFERENCES agent_runs(id) ON DELETE SET NULL,
  reason text CHECK (reason IN ('wrong','incomplete','irrelevant','other')),
  knowledge_source_id text,
  reviewed_by text,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);
CREATE INDEX agent_submissions_queue ON agent_submissions(state, intent, submitted_at DESC);
CREATE INDEX agent_submissions_principal ON agent_submissions(principal_sub, created_at DESC);
