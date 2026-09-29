-- ADR-010: ERP-held Agent proposals, per-item receipts and task provenance.
-- Proposals have no business effect. Only the proposing ERP user can confirm them, in an ERP session,
-- against the stored digest; each item is re-validated and applied in its own savepoint with a receipt.
CREATE TABLE agent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  request_key text NOT NULL,
  request_hash text NOT NULL,
  run_id text,
  title text NOT NULL,
  context_path text,
  items jsonb NOT NULL,
  sha256 text NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','applied','partially_applied','failed','rejected','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  decided_at timestamptz,
  UNIQUE (user_id, request_key)
);
CREATE INDEX idx_agent_proposals_user ON agent_proposals(user_id, created_at DESC);
CREATE TABLE agent_action_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES agent_proposals(id),
  item_index int NOT NULL,
  kind text NOT NULL,
  state text NOT NULL CHECK (state IN ('applied','skipped','failed')),
  target_type text,
  target_id uuid,
  message text,
  params jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, item_index)
);
CREATE INDEX idx_agent_action_receipts_target ON agent_action_receipts(target_type, target_id);
-- Task provenance (ERP audit F04 hardening for Agent-created work). Existing manual tasks keep NULLs.
ALTER TABLE kanban_tasks ADD COLUMN source_type text;
ALTER TABLE kanban_tasks ADD COLUMN source_id uuid;
ALTER TABLE kanban_tasks ADD COLUMN created_by_user_id uuid REFERENCES users(id);
CREATE INDEX idx_kanban_tasks_source ON kanban_tasks(source_type, source_id);
