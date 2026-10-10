-- Sales pilot authentication: discoverable WebAuthn/passkey credentials for backoffice users.
-- Biometric data never reaches Celerates. The authenticator keeps the private key; ERP stores only
-- the public key, credential id, counters and audit metadata.

ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_auth_method_check;
ALTER TABLE auth_sessions
  ADD CONSTRAINT auth_sessions_auth_method_check
  CHECK (auth_method IN ('password', 'password+email_otp', 'talent_link', 'passkey'));

CREATE TABLE auth_passkey_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE CHECK (char_length(credential_id) BETWEEN 16 AND 2048),
  public_key_spki text NOT NULL CHECK (char_length(public_key_spki) BETWEEN 40 AND 4096),
  algorithm integer NOT NULL CHECK (algorithm IN (-7, -257)),
  sign_count bigint NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
  transports text[] NOT NULL DEFAULT ARRAY[]::text[],
  label text CHECK (char_length(label) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text CHECK (char_length(revoke_reason) <= 60)
);
CREATE INDEX idx_auth_passkey_credentials_user
  ON auth_passkey_credentials(user_id) WHERE revoked_at IS NULL;

CREATE TABLE auth_passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('register', 'login')),
  challenge_sha256 text NOT NULL CHECK (challenge_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes'),
  CHECK ((purpose = 'register') = (user_id IS NOT NULL))
);
CREATE INDEX idx_auth_passkey_challenges_open
  ON auth_passkey_challenges(purpose, expires_at) WHERE consumed_at IS NULL;
