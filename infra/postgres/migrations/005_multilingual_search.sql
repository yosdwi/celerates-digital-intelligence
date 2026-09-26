-- Indonesian + English lexical search (doc 15 §2.4). One stored vector per chunk: Indonesian stems (pembayaran →
-- bayar), English stems (submits → submit) and simple tokens for prefix matching (onboard:* → onboarding).
-- The original English-only `search` column stays for compatibility; retrieval now uses `search_multi`.
ALTER TABLE chunks ADD COLUMN search_multi tsvector GENERATED ALWAYS AS (
  to_tsvector('indonesian', text) || to_tsvector('english', text) || to_tsvector('simple', text)
) STORED;
CREATE INDEX chunks_search_multi_idx ON chunks USING gin(search_multi);
