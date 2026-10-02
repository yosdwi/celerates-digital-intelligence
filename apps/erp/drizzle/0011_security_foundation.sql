-- Security foundation (docs/security/01–04). PostgreSQL is the session authority: the browser cookie carries only
-- a session id. Email codes and trusted-browser tokens are stored only as keyed hashes. Identity documents keep
-- metadata here and ciphertext in MinIO. The sensitive access log is append-only.

CREATE TABLE auth_trusted_browsers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  device text CHECK (char_length(device) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  CHECK (expires_at > created_at)
);
CREATE INDEX idx_auth_trusted_browsers_user ON auth_trusted_browsers(user_id) WHERE revoked_at IS NULL;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_method text NOT NULL CHECK (auth_method IN ('password', 'password+email_otp', 'talent_link')),
  auth_time timestamptz NOT NULL DEFAULT now(),
  trusted_browser_id uuid REFERENCES auth_trusted_browsers(id) ON DELETE SET NULL,
  step_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  device text CHECK (char_length(device) <= 120),
  ip_prefix text CHECK (char_length(ip_prefix) <= 64),
  revoked_at timestamptz,
  revoke_reason text CHECK (char_length(revoke_reason) <= 60),
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);
CREATE INDEX idx_auth_sessions_user_open ON auth_sessions(user_id) WHERE revoked_at IS NULL;

-- One row per emailed (or break-glass) code. Single use; at most 5 wrong guesses; superseded by a newer code.
CREATE TABLE auth_email_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('login', 'step_up', 'reset')),
  session_id uuid REFERENCES auth_sessions(id) ON DELETE CASCADE,
  code_hmac text NOT NULL CHECK (code_hmac ~ '^[0-9a-f]{64}$'),
  delivery text NOT NULL DEFAULT 'email' CHECK (delivery IN ('email', 'break_glass')),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes'),
  CHECK ((purpose = 'step_up') = (session_id IS NOT NULL))
);
CREATE INDEX idx_auth_email_challenges_open ON auth_email_challenges(user_id, purpose) WHERE consumed_at IS NULL;

-- Sensitivity capabilities beside the division RBAC. Owners hold none implicitly except access administration.
CREATE TABLE user_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability IN ('identity.read', 'identity.reveal', 'identity_document.read', 'bank.read',
    'bank.write', 'compensation.read', 'compensation.write', 'payroll.export', 'access.admin')),
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'onboarding', 'employee')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  granted_by uuid NOT NULL REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  CHECK (expires_at IS NULL OR expires_at > granted_at),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE UNIQUE INDEX uq_user_capabilities_active ON user_capabilities(user_id, capability) WHERE revoked_at IS NULL;

-- Who touched sensitive data or authentication, and the decision. Never holds content, identity numbers, codes or keys.
CREATE TABLE sensitive_access_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  session_id uuid,
  action text NOT NULL CHECK (char_length(action) <= 60),
  resource_type text CHECK (char_length(resource_type) <= 60),
  resource_id text CHECK (char_length(resource_id) <= 120),
  subject_employee_id uuid,
  subject_onboarding_id uuid,
  subject_user_id uuid,
  decision text NOT NULL CHECK (decision IN ('allow', 'deny')),
  reason text CHECK (char_length(reason) <= 200),
  step_up_at timestamptz,
  ip_hash text CHECK (ip_hash ~ '^[0-9a-f]{16}$'),
  device text CHECK (char_length(device) <= 120)
);
CREATE INDEX idx_sensitive_access_log_actor ON sensitive_access_log(actor_user_id, at DESC);
CREATE INDEX idx_sensitive_access_log_resource ON sensitive_access_log(resource_type, resource_id);

-- Append-only for every role that does not own the trigger. The app role still owns this table today; a superuser
-- moves ownership to an audit role and leaves the app INSERT + SELECT (runbook in docs/security/03).
CREATE FUNCTION sensitive_access_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sensitive_access_log is append-only';
END $$;
CREATE TRIGGER trg_sensitive_access_log_no_update BEFORE UPDATE OR DELETE ON sensitive_access_log
  FOR EACH ROW EXECUTE FUNCTION sensitive_access_log_append_only();
CREATE TRIGGER trg_sensitive_access_log_no_truncate BEFORE TRUNCATE ON sensitive_access_log
  FOR EACH STATEMENT EXECUTE FUNCTION sensitive_access_log_append_only();

-- Private identity documents (doc 04). The object key is opaque; the subject never changes after upload (it is part
-- of the encryption's associated data). Stage (onboarding → employee) is derived from employees at read time.
CREATE TABLE identity_documents (
  id uuid PRIMARY KEY,
  subject_onboarding_id uuid REFERENCES onboarding_requests(id),
  subject_employee_id uuid REFERENCES employees(id),
  subject_user_id uuid REFERENCES users(id),
  doc_type text NOT NULL CHECK (doc_type IN ('ktp', 'kk', 'npwp', 'bpjs_kesehatan', 'bpjs_ketenagakerjaan')),
  object_key text NOT NULL UNIQUE CHECK (object_key ~ '^id/[0-9a-f]{32}$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  media_type text NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  wrapped_dek text NOT NULL,
  kek_version integer NOT NULL CHECK (kek_version > 0),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verification_status text NOT NULL DEFAULT 'uploaded' CHECK (verification_status IN ('uploaded', 'verified', 'rejected')),
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  retention_until date,
  deleted_at timestamptz,
  CHECK (num_nonnulls(subject_onboarding_id, subject_employee_id, subject_user_id) >= 1),
  CHECK ((verification_status = 'uploaded') = (verified_at IS NULL))
);
CREATE INDEX idx_identity_documents_onboarding ON identity_documents(subject_onboarding_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_identity_documents_employee ON identity_documents(subject_employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_identity_documents_user ON identity_documents(subject_user_id) WHERE deleted_at IS NULL;
