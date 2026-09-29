-- Doc 22 R3.2: a Talent deep link has no time expiry. It stays single-use and bound to one user, and issuing a
-- newer link supersedes older unused ones, so only the latest link works. Purposes gain 'direct' (a PMO sends one
-- Talent a link) and 'whatsapp' (the Talent asks the bot for a fresh link).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'talent_link_grants'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%expires_at%' OR pg_get_constraintdef(oid) LIKE '%purpose%')
  LOOP
    EXECUTE format('ALTER TABLE talent_link_grants DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE talent_link_grants ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE talent_link_grants ADD COLUMN superseded_at timestamptz;
ALTER TABLE talent_link_grants ADD CONSTRAINT ck_talent_link_grants_expiry CHECK (expires_at IS NULL OR expires_at > created_at);
ALTER TABLE talent_link_grants ADD CONSTRAINT ck_talent_link_grants_purpose CHECK (purpose IN ('campaign','manual','direct','whatsapp'));
CREATE INDEX idx_talent_link_grants_open ON talent_link_grants(user_id) WHERE used_at IS NULL AND superseded_at IS NULL;
