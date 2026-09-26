CREATE TABLE auth_attempts (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);
CREATE INDEX idx_auth_attempts_window ON auth_attempts(window_start);
