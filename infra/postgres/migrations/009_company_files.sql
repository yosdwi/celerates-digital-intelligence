-- Company Files (doc 17, ADR-018): a governed registry over files wherever their bytes are owned.
--   managed  : uploaded to Company Files; bytes in Intelligence object storage (immutable, sha-addressed keys)
--   erp      : ERP attachments / file columns declared by ERP; bytes stay in ERP storage; ERP authorizes reads
--   external : a link (URL); no content in this increment
-- Access class is ERP policy; it can be tightened automatically but only loosened by a person.
CREATE TABLE files(
  id text PRIMARY KEY,
  origin text NOT NULL CHECK (origin IN ('managed','erp','external')),
  origin_ref text,
  kind text NOT NULL,
  title text NOT NULL,
  access_class text NOT NULL CHECK (access_class IN ('general','division','commercial','personal')),
  owner_division text,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('pending_review','active','withdrawn')),
  hold text,
  current_version int,
  open_url text,                  -- erp/external: where ERP opens it (ERP-relative path or the external URL)
  knowledge_source_id text REFERENCES knowledge_sources(id),
  created_by text NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  seen_at timestamptz,            -- erp/external: last time the ERP feed listed it
  UNIQUE (origin, origin_ref),
  CHECK (access_class = 'general' OR owner_division IS NOT NULL)
);
CREATE INDEX files_listing ON files(state, access_class, owner_division, kind);

CREATE TABLE file_versions(
  file_id text NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version int NOT NULL,
  name text NOT NULL,
  media_type text,
  size_bytes bigint,
  sha256 text,
  object_key text,
  origin_etag text,
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ingest_state text NOT NULL DEFAULT 'queued'
    CHECK (ingest_state IN ('queued','running','indexed','metadata_only','failed')),
  attempts int NOT NULL DEFAULT 0,
  lease_until timestamptz,
  error text,
  parser text,
  pages int,
  ocr_pages int,
  tables int,
  flags jsonb NOT NULL DEFAULT '{}',
  extracted jsonb NOT NULL DEFAULT '{}',
  indexed_at timestamptz,
  PRIMARY KEY (file_id, version)
);
CREATE INDEX file_versions_queue ON file_versions(created_at) WHERE ingest_state IN ('queued','running','failed');

CREATE TABLE file_links(
  file_id text NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  label text,
  href text,
  basis text NOT NULL CHECK (basis IN ('erp_declared','user','extracted')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, entity_type, entity_id)
);
CREATE INDEX file_links_entity ON file_links(entity_type, entity_id);

CREATE TABLE file_access_log(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_id text NOT NULL,
  version int,
  principal_sub text NOT NULL,
  principal_name text,
  action text NOT NULL CHECK (action IN ('preview','download','agent_read')),
  via text NOT NULL CHECK (via IN ('erp_ui','agent')),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX file_access_log_file ON file_access_log(file_id, at DESC);

-- File chunks live in the existing chunk store (multilingual FTS, embeddings, reembed). Knowledge retrieval joins
-- through document_id, so file chunks never appear in knowledge search.
ALTER TABLE chunks ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE chunks ALTER COLUMN embedding_model DROP NOT NULL;
ALTER TABLE chunks ADD COLUMN file_id text, ADD COLUMN file_version int,
  ADD COLUMN page_from int, ADD COLUMN page_to int, ADD COLUMN heading text,
  ADD COLUMN block text NOT NULL DEFAULT 'text' CHECK (block IN ('text','table','ocr'));
ALTER TABLE chunks ADD CONSTRAINT chunks_one_owner CHECK ((document_id IS NULL) <> (file_id IS NULL));
ALTER TABLE chunks ADD CONSTRAINT chunks_file_fk FOREIGN KEY (file_id, file_version)
  REFERENCES file_versions(file_id, version) ON DELETE CASCADE;
CREATE UNIQUE INDEX chunks_file_ordinal ON chunks(file_id, file_version, ordinal) WHERE file_id IS NOT NULL;
