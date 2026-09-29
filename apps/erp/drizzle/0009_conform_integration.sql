-- ConForm as a bounded operational service behind Celerates (doc 19, ADR-019).
-- Celerates owns the Talent identity link and the deep-link grants. It stores no ConForm readiness, correction,
-- evidence, JID or phone data: those stay in ConForm and are read through /api/celerates/v1.
CREATE TABLE talent_identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  conform_employee_id text NOT NULL CHECK (char_length(conform_employee_id) BETWEEN 1 AND 120),
  nrp text NOT NULL CHECK (char_length(nrp) BETWEEN 1 AND 60),
  display_name text NOT NULL,
  erp_employee_id uuid REFERENCES employees(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  linked_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_talent_identity_link_user ON talent_identity_links(user_id) WHERE status = 'active';
CREATE UNIQUE INDEX uq_talent_identity_link_employee ON talent_identity_links(conform_employee_id) WHERE status = 'active';

-- A grant is the only way a WhatsApp reminder reaches a Celerates session. The code is 32 random bytes; only its
-- SHA-256 is stored. Single-use, bounded (max 7 days), bound to one user and a target under /me.
CREATE TABLE talent_link_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES users(id),
  target_path text NOT NULL CHECK (target_path ~ '^/me(/|\?|$)' AND char_length(target_path) <= 300),
  purpose text NOT NULL CHECK (purpose IN ('campaign','manual')),
  campaign_ref text,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days')
);
CREATE INDEX idx_talent_link_grants_user ON talent_link_grants(user_id, created_at DESC);
