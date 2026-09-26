-- Operating Substrate: proposal outcomes as learning signals, and user-provided datasets for "Drop anything".
-- Outcomes are observations reported by ERP after the user decided; ERP receipts remain the record of truth.
CREATE TABLE agent_outcomes(
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  proposal_id text NOT NULL,
  principal_sub text NOT NULL,
  state text NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}',
  receipts jsonb NOT NULL DEFAULT '{}',
  outcome jsonb,
  edited_items int NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id, proposal_id)
);
-- A dataset is an immutable, user-owned upload (CSV/XLSX), profiled once. Only its owner can use it.
CREATE TABLE agent_datasets(
  id text PRIMARY KEY,
  principal_sub text NOT NULL,
  name text NOT NULL,
  media_type text NOT NULL,
  sha256 text NOT NULL,
  object_key text NOT NULL,
  size_bytes int NOT NULL,
  profile jsonb NOT NULL,
  rows jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_datasets_owner ON agent_datasets(principal_sub, created_at DESC);
-- Mapping memory: a header set that was imported successfully maps the same way next time.
-- Learned only from an applied ERP proposal; never from a model guess alone.
CREATE TABLE agent_mapping_templates(
  fingerprint text NOT NULL,
  command text NOT NULL,
  mapping jsonb NOT NULL,
  learned_from_run text NOT NULL,
  learned_by text NOT NULL,
  uses int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(fingerprint, command)
);
