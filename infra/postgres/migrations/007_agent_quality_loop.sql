-- Quality loop (ADR-015). Model turns are kept so an answer can be audited and replayed against another model with
-- the same frozen evidence; feedback is the user's observation of an answer; evaluation cases and runs measure
-- providers before a switch. None of these change ERP or knowledge.
CREATE TABLE agent_model_turns(
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  turn int NOT NULL,
  model text NOT NULL,
  request jsonb NOT NULL,
  reply jsonb,
  verdict text NOT NULL,
  tokens int NOT NULL DEFAULT 0,
  latency_ms int NOT NULL DEFAULT 0,
  ledger jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id, turn)
);
CREATE INDEX agent_model_turns_recorded ON agent_model_turns(recorded_at);
CREATE TABLE agent_feedback(
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  principal_sub text NOT NULL,
  rating smallint NOT NULL CHECK (rating IN (-1, 1)),
  reason text CHECK (reason IN ('wrong','incomplete','irrelevant','other')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id, principal_sub)
);
CREATE TABLE agent_eval_cases(
  id text PRIMARY KEY,
  run_id text NOT NULL UNIQUE REFERENCES agent_runs(id) ON DELETE CASCADE,
  question text NOT NULL,
  expect jsonb NOT NULL,
  note text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agent_eval_runs(
  id text PRIMARY KEY,
  model text NOT NULL,
  state text NOT NULL DEFAULT 'running' CHECK (state IN ('running','succeeded','failed')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb,
  results jsonb NOT NULL DEFAULT '[]'
);
