import { createHash } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
/**
 * Fixed 15-minute window per key (an email, an IP, a user's code requests…). Keys are hashed before storage.
 * Returns false once more than `limit` attempts happened in the window.
 */
export async function allowAttempt(sql: Sql | TransactionSql, key: string, limit: number) {
  const hashed = createHash("sha256").update(key.trim().toLowerCase()).digest("hex");
  const [row] = await sql`
    INSERT INTO auth_attempts (key, window_start, attempts) VALUES (${hashed}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN auth_attempts.window_start < now() - interval '15 minutes' THEN 1 ELSE auth_attempts.attempts + 1 END,
      window_start = CASE WHEN auth_attempts.window_start < now() - interval '15 minutes' THEN now() ELSE auth_attempts.window_start END
    RETURNING attempts`;
  // Small pilot: prune expired windows on each attempt; index bounds this scan.
  await sql`DELETE FROM auth_attempts WHERE window_start < now() - interval '1 day'`;
  return row.attempts <= limit;
}
