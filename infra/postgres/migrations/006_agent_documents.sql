-- `Drop anything` beyond tables: a user-owned upload is either a table (rows) or a document (text chunks).
-- Documents are the user's own working material: owner-only, never knowledge, purged with datasets (30 days).
ALTER TABLE agent_datasets ADD COLUMN kind text NOT NULL DEFAULT 'table' CHECK (kind IN ('table','document'));
