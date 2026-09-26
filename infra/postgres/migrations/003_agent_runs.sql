-- Operating Substrate M1: persisted Agent runs and their AG-UI event log (ADR-013).
-- Runs belong to the ERP user named by the verified delegation (ADR-008). Steps are the
-- canonical record; the SSE stream and any later replay are rendered from them.
CREATE TABLE agent_runs(
  id text PRIMARY KEY,
  thread_id text NOT NULL,
  principal_sub text NOT NULL,
  principal_name text NOT NULL,
  delegation_jti text NOT NULL,
  context jsonb NOT NULL,
  skill text NOT NULL,
  input jsonb NOT NULL,
  modality text NOT NULL DEFAULT 'text' CHECK (modality IN ('text','voice')),
  playbook_version text NOT NULL,
  state text NOT NULL DEFAULT 'running' CHECK (state IN ('running','succeeded','failed')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX agent_runs_principal ON agent_runs(principal_sub, created_at DESC);
CREATE INDEX agent_runs_thread ON agent_runs(thread_id, created_at);
CREATE TABLE agent_steps(
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq int NOT NULL,
  type text NOT NULL,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id, seq)
);
