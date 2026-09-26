import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export async function migrate(url = process.env.DIRECT_URL || process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(731882001)`;
      const [{ exists }] = await tx`SELECT to_regclass('public.erp_migrations') IS NOT NULL AS exists`;
      if (!exists) {
        const [{ count }] = await tx`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`;
        if (count > 0) throw new Error('Refusing automatic baseline on an existing database. Restore/migration review required.');
      }
      await tx`CREATE TABLE IF NOT EXISTS erp_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
      const dir = new URL('../drizzle/', import.meta.url);
      for (const name of (await readdir(dir)).filter(n => n.endsWith('.sql')).sort()) {
        const source = await readFile(new URL(name, dir), 'utf8');
        const hash = createHash('sha256').update(source).digest('hex');
        const [prior] = await tx`SELECT sha256 FROM erp_migrations WHERE name = ${name}`;
        if (prior) { if (prior.sha256 !== hash) throw new Error(`Migration checksum mismatch: ${name}`); continue; }
        await tx.unsafe(source);
        await tx`INSERT INTO erp_migrations (name, sha256) VALUES (${name}, ${hash})`;
        console.log(`Applied ${name}`);
      }
      for (const [key, name] of Object.entries({ marketing:'Marketing',sales:'Sales',ta:'Talent Acquisition',hr:'Human Resources',tm:'Talent Management',pmo:'PMO',automation:'Automasi & Chatbot',finance:'Finance',school:'School' })) {
        await tx`INSERT INTO divisions (key, name) VALUES (${key}, ${name}) ON CONFLICT (key) DO NOTHING`;
      }
    });
  } finally { await sql.end(); }
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) await migrate();
