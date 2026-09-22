CREATE EXTENSION IF NOT EXISTS vector;
-- This schema stands in for the external ERP in demo mode ONLY.
CREATE SCHEMA IF NOT EXISTS demo_erp;
CREATE TABLE demo_erp.objects (
  kind text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,id)
);
CREATE TABLE demo_erp.actions (
  idempotency_key text PRIMARY KEY, kind text NOT NULL, object_id text NOT NULL,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workspaces (
  opportunity_id text PRIMARY KEY, revision int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE documents (
  id text PRIMARY KEY, opportunity_id text NOT NULL REFERENCES workspaces(opportunity_id),
  name text NOT NULL, object_key text NOT NULL, sha256 text NOT NULL,
  media_type text NOT NULL, size_bytes int NOT NULL, source_url text,
  state text NOT NULL DEFAULT 'REGISTERED', extracted_text text, error text,
  parser text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(opportunity_id,sha256)
);
CREATE TABLE chunks (
  id text PRIMARY KEY, document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal int NOT NULL, text text NOT NULL, embedding vector,
  embedding_model text NOT NULL, search tsvector GENERATED ALWAYS AS (to_tsvector('english',text)) STORED,
  UNIQUE(document_id,ordinal)
);
CREATE INDEX chunks_search_idx ON chunks USING gin(search);
CREATE TABLE runs (
  id text PRIMARY KEY, opportunity_id text NOT NULL REFERENCES workspaces(opportunity_id),
  state text NOT NULL, step text NOT NULL DEFAULT 'queued', attempt int NOT NULL DEFAULT 0,
  lease_until timestamptz, error text, decision jsonb, evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_run ON runs(opportunity_id)
  WHERE state IN ('QUEUED','INGESTING','ANALYZING','REVIEW_REQUIRED','RESUMING');
CREATE TABLE artifacts (
  id text PRIMARY KEY, run_id text NOT NULL REFERENCES runs(id), kind text NOT NULL,
  title text NOT NULL, content jsonb NOT NULL, provenance jsonb NOT NULL,
  version int NOT NULL DEFAULT 1, review_state text NOT NULL DEFAULT 'DRAFT',
  reviewed_by text, reviewed_at timestamptz, generation jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,kind)
);
CREATE TABLE artifact_versions (
  artifact_id text NOT NULL REFERENCES artifacts(id), version int NOT NULL,
  content jsonb NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(artifact_id,version)
);
CREATE TABLE events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, opportunity_id text,
  run_id text, type text NOT NULL, message text NOT NULL, actor text NOT NULL DEFAULT 'system',
  data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ingestion_audit (
  id text PRIMARY KEY, source text NOT NULL, connector text NOT NULL, state text NOT NULL,
  accepted int NOT NULL DEFAULT 0, rejected int NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
