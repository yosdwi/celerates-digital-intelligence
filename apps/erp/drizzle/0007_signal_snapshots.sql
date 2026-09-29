-- Signal history (Agent M4): one snapshot per attention rule per day (Asia/Jakarta), refreshed at most every
-- 15 minutes while people use Perlu perhatian. It lets the panel and the Agent say what changed since the last day
-- observed. Observations only: the current rule result is always recomputed from live ERP data.
CREATE TABLE operational_signal_snapshots (
  day date NOT NULL,
  rule_key text NOT NULL,
  count integer NOT NULL,
  ids jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, rule_key)
);
