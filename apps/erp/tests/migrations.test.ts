import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
// The same migration runner is exercised over the PG wire protocol. CI also
// runs against PostgreSQL 16; PGlite is the restricted-workspace fallback.

test('baseline is repeatable, includes all domains, refuses checksum drift', async () => {
  // @ts-expect-error JavaScript runtime module
  const { migrate } = await import("../scripts/migrate.mjs");
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, port: 55439, host: '127.0.0.1' });
  await server.start();
  const url = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:55439/postgres';
  const sql = postgres(url,{max:1,prepare:false});
  try {
    await migrate(url); await migrate(url);
    const [tables] = await sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`;
    assert.equal(tables.n, 70);
    const [divisions] = await sql`SELECT count(*)::int AS n FROM divisions`;
    assert.equal(divisions.n,9);
    const [owners] = await sql`SELECT count(*)::int AS n FROM users WHERE is_owner`;
    assert.equal(owners.n,0);
    await sql`UPDATE erp_migrations SET sha256='tampered' WHERE name='0002_login_throttle.sql'`;
    await sql.end();
    await assert.rejects(migrate(url),/checksum mismatch/);
  } finally { await sql.end(); await server.stop(); await db.close(); }
});
