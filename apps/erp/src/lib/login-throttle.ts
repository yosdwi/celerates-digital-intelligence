import { createHash } from "node:crypto";
import { sql } from "@/db";
export async function allowLoginAttempt(email: string) {
  const key = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const [row] = await sql`
    INSERT INTO auth_attempts (key, window_start, attempts) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN auth_attempts.window_start < now() - interval '15 minutes' THEN 1 ELSE auth_attempts.attempts + 1 END,
      window_start = CASE WHEN auth_attempts.window_start < now() - interval '15 minutes' THEN now() ELSE auth_attempts.window_start END
    RETURNING attempts`;
  // Small pilot: prune expired windows on each attempt; index bounds this scan.
  await sql`DELETE FROM auth_attempts WHERE window_start < now() - interval '1 day'`;
  return row.attempts <= 20;
}
