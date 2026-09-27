-- M6.x: where a managed Company File came from, e.g. an Agent attachment the user explicitly saved. The Agent
-- attachment itself stays working context (owner-only, purged after AGENT_DATASET_DAYS); the saved file is an
-- independent governed copy with its own class, versions and retention.
ALTER TABLE files ADD COLUMN provenance jsonb NOT NULL DEFAULT '{}';
