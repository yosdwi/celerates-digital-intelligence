CREATE TABLE knowledge_sources (
 id text PRIMARY KEY, source_key text NOT NULL UNIQUE, title text NOT NULL,
 scope_type text NOT NULL CHECK(scope_type IN ('company','division','opportunity')),
 scope_id text NOT NULL, classification text NOT NULL CHECK(classification IN ('internal','restricted')),
 source_kind text NOT NULL CHECK(source_kind IN ('policy','playbook','reference','lesson')),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE documents ALTER COLUMN opportunity_id DROP NOT NULL;
ALTER TABLE documents ADD COLUMN source_id text REFERENCES knowledge_sources(id);
ALTER TABLE documents ADD COLUMN source_version int;
ALTER TABLE documents ADD COLUMN lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','active','superseded','deprecated'));
ALTER TABLE documents ADD COLUMN approved_by text;
ALTER TABLE documents ADD COLUMN approved_at timestamptz;
ALTER TABLE documents ADD CONSTRAINT knowledge_version_unique UNIQUE(source_id,source_version);
CREATE UNIQUE INDEX knowledge_one_active ON documents(source_id) WHERE lifecycle='active';
CREATE INDEX knowledge_scope ON knowledge_sources(scope_type,scope_id,classification);
CREATE INDEX knowledge_ingestion_queue ON documents(created_at) WHERE source_id IS NOT NULL AND state='REGISTERED';
CREATE TABLE knowledge_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,source_id text NOT NULL REFERENCES knowledge_sources(id),document_id text,action text NOT NULL,actor text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE context_snapshots(id text PRIMARY KEY,run_id text UNIQUE REFERENCES runs(id),opportunity_id text NOT NULL,actor text NOT NULL,policy_version text NOT NULL,workflow_version text NOT NULL,sha256 text NOT NULL,body jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE runs ADD COLUMN requested_by text NOT NULL DEFAULT 'local-demo';
ALTER TABLE runs ADD COLUMN context_id text REFERENCES context_snapshots(id);
ALTER TABLE runs ADD COLUMN erp_review jsonb;
ALTER TABLE runs ADD COLUMN erp_receipt jsonb;
DROP INDEX one_active_run;
CREATE UNIQUE INDEX one_active_run ON runs(opportunity_id) WHERE state IN ('QUEUED','INGESTING','ANALYZING','REVIEW_REQUIRED','RESUMING','ERP_REVIEW_REQUIRED');
CREATE TABLE workflow_outcomes(id text PRIMARY KEY,run_id text UNIQUE NOT NULL REFERENCES runs(id),context_id text REFERENCES context_snapshots(id),outcome text NOT NULL,receipt jsonb NOT NULL,checks jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE outcome_feedback(id text PRIMARY KEY,outcome_id text NOT NULL REFERENCES workflow_outcomes(id),actor text NOT NULL,rating int NOT NULL CHECK(rating BETWEEN 1 AND 5),correction text NOT NULL,request_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(actor,request_key));
