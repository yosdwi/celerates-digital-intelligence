// Default test accounts (doc 22 §2.2). Explicit and idempotent; NOT a migration.
//   TEST_ACCOUNT_PASSWORD=... DATABASE_URL=... npm run seed:test-accounts
//   DATABASE_URL=... npm run seed:test-accounts -- --disable      (sets every account below to inactive)
// Optional: TEST_TALENT_YOSES_EMPLOYEE_ID / TEST_TALENT_PUTRA_EMPLOYEE_ID (ConForm employee ids) create or refresh the
// Talent identity link; TEST_TALENT_YOSES_NRP / TEST_TALENT_PUTRA_NRP set its NRP (defaults to the employee id).
// The password is read from the environment only; it is never printed. Output lists e-mails and actions only.
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const DOMAIN = 'celerates.com';
const BCRYPT_COST = 12; // same cost as the Owner bootstrap (src/lib/bootstrap.ts)
const MARK = 'Test account (seed:test-accounts)';
const DIVISIONS = ['marketing', 'sales', 'ta', 'hr', 'tm', 'finance', 'automation', 'school'];

const ADMIN = `administrator.test.ierp@${DOMAIN}`;
const ACCOUNTS = [
  { email: ADMIN, name: 'Administrator (test)', type: 'backoffice', owner: true, access: [] },
  { email: `pmo.test.ierp@${DOMAIN}`, name: 'PMO (test)', type: 'backoffice', owner: false, access: [['pmo', 'full']] },
  ...DIVISIONS.map((key) => ({ email: `${key}.test.ierp@${DOMAIN}`, name: `${key.toUpperCase()} (test)`, type: 'backoffice', owner: false, access: [[key, 'full']] })),
  { email: `talent.yoses.test.ierp@${DOMAIN}`, name: 'Yoses (test)', type: 'talent', owner: false, access: [], employeeEnv: 'TEST_TALENT_YOSES_EMPLOYEE_ID', nrpEnv: 'TEST_TALENT_YOSES_NRP' },
  { email: `talent.putra.test.ierp@${DOMAIN}`, name: 'Putra Tama (test)', type: 'talent', owner: false, access: [], employeeEnv: 'TEST_TALENT_PUTRA_EMPLOYEE_ID', nrpEnv: 'TEST_TALENT_PUTRA_NRP' },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) fail('DATABASE_URL is required.');
const disable = process.argv.includes('--disable');
const password = process.env.TEST_ACCOUNT_PASSWORD ?? '';
if (!disable && (password.length < 8 || password.length > 72)) fail('TEST_ACCOUNT_PASSWORD is required (8 to 72 characters). Refusing to seed.');
// docs/security R5.4: shared test accounts never sign in to an internet-facing pilot/production. Disabling is always allowed.
if (!disable && ['pilot', 'production', 'erp-pilot'].includes(process.env.APP_ENV ?? '') && process.env.ALLOW_TEST_ACCOUNTS !== '1')
  fail(`APP_ENV=${process.env.APP_ENV}: refusing to create shared test accounts here (use staging, or --disable).`);

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
const report = [];
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(731882002)`;
    if (disable) {
      for (const account of ACCOUNTS) {
        const rows = await tx`UPDATE users SET status = 'inactive' WHERE email = ${account.email} RETURNING id`;
        // Sessions end at once (they also stop validating because the user is inactive).
        if (rows.length) await tx`UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'test_account_disabled' WHERE user_id = ${rows[0].id} AND revoked_at IS NULL`;
        report.push([account.email, rows.length ? 'disabled' : 'not found']);
      }
      return;
    }
    const divisionIds = new Map((await tx`SELECT id, key FROM divisions`).map((d) => [d.key, d.id]));
    for (const key of ['pmo', ...DIVISIONS]) if (!divisionIds.has(key)) throw new Error(`Division ${key} is missing; run db:migrate first.`);

    const ids = new Map();
    for (const account of ACCOUNTS) {
      const [existing] = await tx`SELECT id, password_hash FROM users WHERE email = ${account.email}`;
      const keepHash = existing?.password_hash && (await bcrypt.compare(password, existing.password_hash));
      const hash = keepHash ? existing.password_hash : await bcrypt.hash(password, BCRYPT_COST);
      let id;
      if (existing) {
        await tx`UPDATE users SET full_name = ${account.name}, role_title = ${MARK}, password_hash = ${hash}, status = 'active',
          is_owner = ${account.owner}, account_type = ${account.type} WHERE id = ${existing.id}`;
        id = existing.id;
        report.push([account.email, 'updated']);
      } else {
        const [row] = await tx`INSERT INTO users (email, full_name, role_title, password_hash, status, is_owner, account_type)
          VALUES (${account.email}, ${account.name}, ${MARK}, ${hash}, 'active', ${account.owner}, ${account.type}) RETURNING id`;
        id = row.id;
        report.push([account.email, 'created']);
      }
      ids.set(account.email, id);

      // Exactly the intended division access, nothing else.
      const wanted = account.access.map(([key, level]) => [divisionIds.get(key), level]);
      const wantedIds = wanted.map(([divisionId]) => divisionId);
      if (wantedIds.length) await tx`DELETE FROM user_access WHERE user_id = ${id} AND NOT (division_id = ANY(${wantedIds}))`;
      else await tx`DELETE FROM user_access WHERE user_id = ${id}`;
      for (const [divisionId, level] of wanted) {
        await tx`INSERT INTO user_access (user_id, division_id, level) VALUES (${id}, ${divisionId}, ${level})
          ON CONFLICT (user_id, division_id) DO UPDATE SET level = excluded.level`;
      }
    }

    for (const account of ACCOUNTS.filter((a) => a.employeeEnv)) {
      const employeeId = (process.env[account.employeeEnv] ?? '').trim();
      if (!employeeId) continue;
      if (employeeId.length > 120) throw new Error(`${account.employeeEnv} is too long.`);
      const nrp = ((process.env[account.nrpEnv] ?? '').trim() || employeeId).slice(0, 60);
      const userId = ids.get(account.email);
      const [taken] = await tx`SELECT user_id FROM talent_identity_links WHERE conform_employee_id = ${employeeId} AND status = 'active'`;
      if (taken && taken.user_id !== userId) {
        report.push([account.email, 'link skipped: employee is linked to another account']);
        continue;
      }
      const [current] = await tx`SELECT id, conform_employee_id FROM talent_identity_links WHERE user_id = ${userId} AND status = 'active'`;
      if (current && current.conform_employee_id === employeeId) {
        await tx`UPDATE talent_identity_links SET nrp = ${nrp}, display_name = ${account.name} WHERE id = ${current.id}`;
        report.push([account.email, 'link refreshed']);
        continue;
      }
      if (current) {
        await tx`UPDATE talent_identity_links SET status = 'revoked', revoked_at = now() WHERE id = ${current.id}`;
        report.push([account.email, 'previous link revoked']);
      }
      await tx`INSERT INTO talent_identity_links (user_id, conform_employee_id, nrp, display_name, status, linked_by_user_id)
        VALUES (${userId}, ${employeeId}, ${nrp}, ${account.name}, 'active', ${ids.get(ADMIN)})`;
      report.push([account.email, 'link created']);
    }
  });
} catch (error) {
  await sql.end();
  fail(`Seed failed: ${error instanceof Error ? error.message : 'unknown error'}`);
}
await sql.end();
for (const [email, action] of report) console.log(`${email}  ${action}`);
