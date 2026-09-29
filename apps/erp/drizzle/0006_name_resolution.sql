-- Entity/name resolution (Agent M3). pg_trgm enables typo-tolerant `fuzzy` catalog search. It is optional: when the
-- extension cannot be created (managed databases without the privilege), fuzzy search degrades to `any` search.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable (%); fuzzy search disabled', SQLERRM;
END $$;
