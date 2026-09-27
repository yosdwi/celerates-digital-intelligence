-- Company Files (doc 17, ADR-018). ERP is the authority for who may read which class of file, and how each class
-- is handled by Intelligence. Owner-editable data, not hard-coded roles. Identity documents are not a class here:
-- they are never declared as Company Files and never leave ERP.
CREATE TABLE file_class_settings (
  access_class text PRIMARY KEY CHECK (access_class IN ('general','division','commercial','personal')),
  model_visibility text NOT NULL CHECK (model_visibility IN ('none','excerpt','full')),
  indexing text NOT NULL CHECK (indexing IN ('none','lexical','semantic')),
  retention_days int NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 3650),
  updated_by_user_id uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO file_class_settings (access_class, model_visibility, indexing, retention_days) VALUES
  ('general', 'full', 'semantic', 30),
  ('division', 'full', 'semantic', 30),
  ('commercial', 'none', 'lexical', 365),
  ('personal', 'none', 'lexical', 90);
-- Users with at least `min_level` on `division_key` may read that division's files of the class (commercial and
-- personal also require read access to a linked record, decided per request).
CREATE TABLE file_class_grants (
  access_class text NOT NULL CHECK (access_class IN ('commercial','personal')),
  division_key text NOT NULL,
  min_level text NOT NULL CHECK (min_level IN ('viewer','editor','full')),
  PRIMARY KEY (access_class, division_key)
);
INSERT INTO file_class_grants (access_class, division_key, min_level) VALUES
  ('commercial', 'sales', 'editor'), ('commercial', 'pmo', 'editor'), ('commercial', 'finance', 'editor'),
  ('personal', 'ta', 'editor'), ('personal', 'hr', 'editor');
