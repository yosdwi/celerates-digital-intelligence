// Security journey over real HTTP against the production build (docs/security/05): `next start` + PGlite (PG wire)
// + s3rver + a loopback SMTP sink. Synthetic people and documents only; no production URL or credential is used.
//   npm run build && node tests/security-http.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import S3rver from 's3rver';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { migrate } from '../scripts/migrate.mjs';
const require = createRequire(import.meta.url);
const { encodeReply } = require('next/dist/compiled/react-server-dom-webpack/client.node');

const base = 'http://127.0.0.1:3311';
const NIK = '3171019900000003'; // synthetic
const MARKER = 'SYNTHETIC-KTP-HTTP-DO-NOT-USE';
const PASSWORD = 'Synthetic-Only-Password-123';
const dir = await mkdtemp(tmpdir() + '/erp-sec-http-');
const keyring = dir + '/keyring';
await writeFile(keyring, `v1:${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
Object.assign(process.env, {
  DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:55441/postgres', DB_POOL_MAX: '1', NEXTAUTH_URL: base,
  NEXTAUTH_SECRET: randomBytes(32).toString('hex'), PII_ENCRYPTION_KEY: randomBytes(32).toString('hex'), SETUP_TOKEN: randomBytes(32).toString('hex'),
  S3_ENDPOINT: 'http://127.0.0.1:59002', S3_ACCESS_KEY_ID: 'S3RVER', S3_SECRET_ACCESS_KEY: 'S3RVER', S3_BUCKET_PREFIX: 'erp-sec-http',
  IDENTITY_KEYRING_FILE: keyring, AUTH_EMAIL_DOMAINS: 'example.test', SMTP_HOST: '127.0.0.1', SMTP_PORT: '2526', SMTP_USER: 'sink',
  SMTP_PASSWORD: 'sink', SMTP_FROM: 'Celerates ERP <noreply@example.test>', APP_ENV: 'local-test', NEXT_TELEMETRY_DISABLED: '1', PORT: '3311',
});

// Loopback SMTP sink: accepts everything, keeps each message body.
const inbox = [];
const smtp = createServer((sock) => {
  let buf = '', data = false, msg = '';
  sock.write('220 sink\r\n');
  sock.on('data', (chunk) => {
    buf += chunk;
    for (let i; (i = buf.indexOf('\r\n')) >= 0; ) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (data) { if (line === '.') { data = false; inbox.push(msg); msg = ''; sock.write('250 OK\r\n'); } else msg += line + '\n'; continue; }
      const cmd = line.slice(0, 4).toUpperCase();
      sock.write(cmd === 'EHLO' ? '250-sink\r\n250 AUTH PLAIN LOGIN\r\n' : cmd === 'AUTH' ? '235 ok\r\n' : cmd === 'DATA' ? '354 go\r\n' : cmd === 'QUIT' ? '221 bye\r\n' : '250 OK\r\n');
      if (data === false && cmd === 'DATA') data = true;
      if (cmd === 'QUIT') sock.end();
    }
  });
});
await new Promise((r) => smtp.listen(2526, '127.0.0.1', r));
const lastCode = (to) => {
  const m = [...inbox].reverse().find((x) => x.includes(`To: ${to}`));
  return m?.match(/Kode Anda: (\d{6})/)?.[1];
};

const pg = spawn(process.execPath, ['node_modules/@electric-sql/pglite-socket/dist/scripts/server.js', '-p', '55441', '-m', '10'], { stdio: ['ignore', 'ignore', 'pipe'] });
const s3 = new S3rver({ port: 59002, address: '127.0.0.1', silent: true, directory: dir });
let app, output = '';
async function until(fn, label) { for (let i = 0; i < 120; i++) { try { if (await fn()) return; } catch {} await new Promise((r) => setTimeout(r, 250)); } throw new Error('Timeout: ' + label); }
const PASS = (s) => console.log('PASS: ' + s);

class Browser {
  jar = new Map();
  async fetch(path, init = {}) {
    const res = await fetch(base + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { Origin: base, ...(this.jar.size ? { Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...init.headers } });
    for (const line of res.headers.getSetCookie()) {
      const first = line.split(';')[0], at = first.indexOf('=');
      if (/Max-Age=0/i.test(line) || first.slice(at + 1) === '') this.jar.delete(first.slice(0, at)); else this.jar.set(first.slice(0, at), first.slice(at + 1));
    }
    return res;
  }
  json(path, body) { return this.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  async credentials(email, password = PASSWORD) {
    const { csrfToken } = await (await this.fetch('/api/auth/csrf')).json();
    return this.fetch('/api/auth/callback/credentials', { method: 'POST', body: new URLSearchParams({ csrfToken, email, password, callbackUrl: base, json: 'true' }) });
  }
  /** The whole backoffice sign-in as the login form does it. Returns whether a code was needed. */
  async login(email) {
    const start = await (await this.json('/api/login', { action: 'start', email, password: PASSWORD })).json();
    if (start.next === 'otp') {
      const verify = await this.json('/api/login', { action: 'verify', email, code: lastCode(email) });
      assert.equal(verify.status, 200, 'code verified');
    } else assert.equal(start.next, 'signin', JSON.stringify(start));
    await this.credentials(email);
    assert.ok(this.jar.has('next-auth.session-token'), 'session cookie for ' + email);
    return start.next === 'otp';
  }
  async stepUp(email) {
    assert.equal((await this.json('/api/step-up', { action: 'send' })).status, 200, 'step-up code sent');
    assert.equal((await this.json('/api/step-up', { action: 'verify', code: lastCode(email) })).status, 200, 'step-up verified');
  }
}

try {
  await s3.run();
  const probe = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 2 });
  await until(async () => { await probe`SELECT 1`; return true; }, 'PG');
  await probe.end();
  await migrate();
  const { initStorage } = await import('../scripts/init-storage.mjs');
  await initStorage();
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '-p', '3311'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout.on('data', (d) => (output += d));
  app.stderr.on('data', (d) => (output += d));
  await until(async () => (await fetch(base + '/api/health/ready')).ok, 'Next readiness');
  const db = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  const manifest = JSON.parse(await readFile('.next/server/server-reference-manifest.json', 'utf8')).node;
  const actionId = (name, file) => Object.entries(manifest).find(([, v]) => v.exportedName === name && v.filename === file)?.[0];
  const action = async (browser, path, file, name, args) => {
    const id = actionId(name, file);
    assert.ok(id, 'action ' + name);
    const res = await browser.fetch(path, { method: 'POST', headers: { 'Next-Action': id }, body: await encodeReply(args) });
    assert.ok(res.status < 500, `${name}: HTTP ${res.status}`);
    return res.text();
  };
  try {
    // --- Owner bootstrap and anonymous refusals ---
    const owner = new Browser();
    const form = new FormData();
    for (const [k, v] of Object.entries({ token: process.env.SETUP_TOKEN, email: 'owner@example.test', name: 'Synthetic Owner', password: PASSWORD })) form.set(k, v);
    assert.equal((await owner.fetch('/api/setup', { method: 'POST', body: form })).status, 303);
    const anon = new Browser();
    assert.equal((await anon.fetch('/hr')).status, 307);
    assert.equal((await anon.fetch('/api/identity-documents?subject_kind=self')).status, 403);
    assert.equal((await anon.fetch('/api/identity-documents/00000000-0000-0000-0000-000000000000')).status, 403, 'Anonymous → KTP: DENY');
    PASS('anonymous is refused before any page or API code');

    // --- New browser: password alone gets no session; password + mailbox code does ---
    await owner.credentials('owner@example.test');
    assert.ok(!owner.jar.has('next-auth.session-token'), 'password alone on a new browser: no session');
    assert.equal((await owner.fetch('/')).status, 307);
    assert.equal(await owner.login('owner@example.test'), true, 'a code was required');
    assert.match(inbox.at(-1), /Subject: Kode masuk Celerates ERP/);
    assert.equal((await owner.fetch('/access-management')).status, 200, 'signed in');
    const trusted = [...owner.jar.keys()].find((k) => k === 'erp-tb');
    assert.ok(trusted, 'trusted-browser cookie set');
    const [ownerSession] = await db`SELECT auth_method, step_up_at FROM auth_sessions ORDER BY created_at DESC LIMIT 1`;
    assert.equal(ownerSession.auth_method, 'password+email_otp');
    PASS('new browser: password → corporate-mailbox code → trusted browser → revocable session');

    // Daily use: the same browser signs in again with the password only; a valid session needs nothing.
    const sent = inbox.length;
    await owner.fetch('/api/auth/signout', { method: 'POST', body: new URLSearchParams({ csrfToken: (await (await owner.fetch('/api/auth/csrf')).json()).csrfToken, callbackUrl: base, json: 'true' }) });
    assert.equal((await owner.fetch('/access-management')).status, 307, 'logged out');
    assert.equal(await owner.login('owner@example.test'), false, 'no code on the trusted browser');
    assert.equal(inbox.length, sent, 'no email sent');
    for (let i = 0; i < 3; i++) assert.equal((await owner.fetch('/')).status, 200, 'daily use without codes');
    const [logout] = await db`SELECT count(*)::int AS n FROM auth_sessions WHERE revoke_reason = 'logout'`;
    assert.equal(logout.n, 1, 'logout revoked the server-side session');
    PASS('trusted browser: password only after logout; valid session: direct access, no repeated OTP');

    // --- Synthetic people and records ---
    const hash = await bcrypt.hash(PASSWORD, 4);
    const div = Object.fromEntries((await db`SELECT key, id FROM divisions`).map((d) => [d.key, d.id]));
    const user = async (email, type, access = [], caps = []) => {
      const [u] = await db`INSERT INTO users (email, full_name, status, account_type, password_hash) VALUES (${email}, ${'Synthetic ' + email}, 'active', ${type}, ${hash}) RETURNING id`;
      for (const [d, l] of access) await db`INSERT INTO user_access (user_id, division_id, level) VALUES (${u.id}, ${div[d]}, ${l})`;
      for (const c of caps) await db`INSERT INTO user_capabilities (user_id, capability, reason, granted_by) SELECT ${u.id}, ${c}, 'synthetic', id FROM users WHERE email = 'owner@example.test'`;
      return u.id;
    };
    const hrId = await user('hr@example.test', 'backoffice', [['hr', 'viewer']], ['identity_document.read']);
    await user('pmo@example.test', 'backoffice', [['pmo', 'full']]);
    const [onb] = await db`INSERT INTO onboarding_requests (ta_pic_name) VALUES ('Synthetic TA') RETURNING id`;
    const [emp] = await db`INSERT INTO employees (onboarding_request_id, employee_no) VALUES (${onb.id}, 'SYN-HTTP-1') RETURNING id`;

    // --- KTP upload through the ERP (Owner may upload; reading needs an explicit capability) ---
    const ktp = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`${MARKER} ${NIK}`), randomBytes(2048), Buffer.from([0xff, 0xd9])]);
    const upload = (browser, bytes, type = 'image/jpeg', subject = { subject_kind: 'employee', subject_id: emp.id }) => {
      const f = new FormData();
      for (const [k, v] of Object.entries({ ...subject, doc_type: 'ktp' })) f.set(k, v);
      f.set('file', new Blob([bytes], { type }), 'scan.jpg');
      return browser.fetch('/api/identity-documents', { method: 'POST', body: f });
    };
    assert.equal((await upload(owner, Buffer.from('<svg><script>alert(1)</script></svg>'), 'image/svg+xml')).status, 415, 'SVG refused');
    assert.equal((await upload(owner, ktp, 'image/png')).status, 415, 'MIME spoof refused');
    assert.equal((await upload(owner, Buffer.concat([ktp, Buffer.alloc(5 * 1024 * 1024)]))).status, 413, 'oversized refused');
    const nearLimit = Buffer.concat([ktp.subarray(0, -2), Buffer.alloc(4.9 * 1024 * 1024), Buffer.from([0xff, 0xd9])]);
    assert.equal((await upload(owner, nearLimit)).status, 201, 'a 4.9 MB scan passes middleware and the route intact');
    const up = await upload(owner, ktp);
    assert.equal(up.status, 201);
    const { id: docId } = await up.json();
    PASS('upload → validation (magic bytes, declared type, size) → stored');

    const s3c = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' } });
    const [docRow] = await db`SELECT object_key FROM identity_documents WHERE id = ${docId}`;
    const raw = Buffer.from(await (await s3c.send(new GetObjectCommand({ Bucket: 'erp-sec-http-identity-documents', Key: docRow.object_key }))).Body.transformToByteArray());
    assert.ok(!raw.includes(Buffer.from(MARKER)) && !raw.includes(Buffer.from(NIK)), 'raw stored object is ciphertext');
    assert.ok((await s3c.send(new ListObjectsV2Command({ Bucket: 'erp-sec-http-identity-documents' }))).Contents.every((o) => /^id\/[0-9a-f]{32}$/.test(o.Key)));
    assert.equal((await owner.fetch(`/api/documents?bucket=identity-documents&path=${encodeURIComponent(docRow.object_key)}`)).status, 404, 'generic document route cannot reach the identity bucket');
    PASS('private storage: opaque key, ciphertext at rest, generic route refused');

    // Owner without an explicit capability: DENY. Grant (needs step-up) → read.
    assert.equal((await owner.fetch(`/api/identity-documents/${docId}`)).status, 403, 'Owner without capability → KTP: DENY');
    const ownerId = (await db`SELECT id FROM users WHERE email = 'owner@example.test'`)[0].id;
    await action(owner, '/access-management', 'app/access-management/actions.ts', 'grantCapability', [ownerId, 'identity_document.read', 'all', 'Synthetic POC demonstration']);
    assert.equal((await db`SELECT count(*)::int AS n FROM user_capabilities WHERE user_id = ${ownerId}`)[0].n, 0, 'capability grant without step-up refused');
    await owner.stepUp('owner@example.test');
    await action(owner, '/access-management', 'app/access-management/actions.ts', 'grantCapability', [ownerId, 'identity_document.read', 'all', 'Synthetic POC demonstration']);
    assert.equal((await db`SELECT count(*)::int AS n FROM user_capabilities WHERE user_id = ${ownerId}`)[0].n, 1, 'granted after step-up');
    const read = await owner.fetch(`/api/identity-documents/${docId}`);
    assert.equal(read.status, 200);
    assert.ok(Buffer.from(await read.arrayBuffer()).equals(ktp), 'decrypted in memory, streamed to the authorized browser');
    for (const [h, v] of [['cache-control', /no-store/], ['content-disposition', /^attachment/], ['x-content-type-options', /nosniff/], ['content-security-policy', /sandbox/], ['cross-origin-resource-policy', /same-origin/]])
      assert.match(read.headers.get(h) ?? '', v, h);
    PASS('authorized scoped read with step-up; safe response headers');

    await db`UPDATE auth_sessions SET step_up_at = now() - interval '11 minutes' WHERE user_id = ${ownerId} AND revoked_at IS NULL`;
    const stale = await owner.fetch(`/api/identity-documents/${docId}`);
    assert.equal(stale.status, 401);
    assert.deepEqual(await stale.json(), { error: 'step_up_required' });
    PASS('valid session without recent step-up → step_up_required');

    // HR with capability (new browser → code), step-up, read. PMO: deny. Direct API calls get the UI's answer.
    const hr = new Browser();
    await hr.login('hr@example.test');
    assert.equal((await hr.fetch(`/api/identity-documents/${docId}`)).status, 200, 'the login code itself is recent auth for 10 minutes');
    await db`UPDATE auth_sessions SET step_up_at = now() - interval '11 minutes' WHERE user_id = ${hrId} AND revoked_at IS NULL`;
    assert.equal((await hr.fetch(`/api/identity-documents/${docId}`)).status, 401);
    await hr.stepUp('hr@example.test');
    assert.equal((await hr.fetch(`/api/identity-documents/${docId}`)).status, 200, 'HR + capability + step-up: ALLOW');
    const pmo = new Browser();
    await pmo.login('pmo@example.test');
    assert.equal((await pmo.fetch(`/api/identity-documents/${docId}`)).status, 404, 'PMO → KTP: DENY');
    assert.equal((await pmo.fetch(`/api/identity-documents?subject_kind=employee&subject_id=${emp.id}`)).status, 404, 'PMO gets no status either');
    assert.equal((await pmo.fetch('/hr')).status, 403, 'route gate from fresh claims');
    PASS('HR with capability allowed after step-up; PMO denied on the direct API');

    // Copied cookie, then revocation: refused on the next request.
    const thief = new Browser();
    thief.jar.set('next-auth.session-token', hr.jar.get('next-auth.session-token'));
    assert.equal((await thief.fetch('/hr')).status, 200, 'a copied cookie works while the session lives');
    await action(hr, '/profile', 'lib/security/actions.ts', 'logoutAllDevices', []);
    assert.equal((await thief.fetch('/hr')).status, 307, 'copied cookie refused after logout-all');
    assert.equal((await thief.fetch(`/api/identity-documents/${docId}`)).status, 403, 'revoked session → KTP: DENY');
    PASS('copied browser session stops working immediately after revocation');

    // Deactivation: immediate.
    const hr2 = new Browser();
    await db`UPDATE auth_trusted_browsers SET revoked_at = NULL, revoke_reason = NULL WHERE user_id = ${hrId}`; // keep the login short
    await hr2.login('hr@example.test');
    assert.equal((await hr2.fetch('/hr')).status, 200);
    await action(owner, '/access-management', 'app/access-management/actions.ts', 'deactivateUser', [hrId]);
    assert.equal((await hr2.fetch('/hr')).status, 307, 'deactivated user loses every path at once');
    assert.equal((await hr2.json('/api/login', { action: 'start', email: 'hr@example.test', password: PASSWORD })).status, 401, 'and cannot sign in');
    PASS('deactivation revokes sessions immediately');

    // Talent: own KTP through the WhatsApp-link session.
    const [talent] = await db`INSERT INTO users (email, full_name, status, account_type) VALUES ('talent@example.test', 'Synthetic Talent', 'active', 'talent') RETURNING id`;
    await db`INSERT INTO talent_identity_links (user_id, conform_employee_id, nrp, display_name, linked_by_user_id) VALUES (${talent.id}, 'SYN-T', 'NT', 'T', ${ownerId})`;
    const code = randomBytes(32).toString('base64url');
    await db`INSERT INTO talent_link_grants (token_sha256, user_id, target_path, purpose) VALUES (${createHash('sha256').update(code).digest('hex')}, ${talent.id}, '/me', 'manual')`;
    const t = new Browser();
    const { csrfToken } = await (await t.fetch('/api/auth/csrf')).json();
    await t.fetch('/api/auth/callback/talent-link', { method: 'POST', body: new URLSearchParams({ csrfToken, code, callbackUrl: base + '/me', json: 'true' }) });
    assert.ok(t.jar.has('next-auth.session-token'), 'Talent session');
    const own = await upload(t, ktp, 'image/jpeg', { subject_kind: 'self' });
    assert.equal(own.status, 201, 'Talent uploads own KTP');
    const ownId = (await own.json()).id;
    assert.equal((await t.fetch(`/api/identity-documents/${ownId}`)).status, 200, 'Talent own KTP with recent link: ALLOW');
    assert.equal((await t.fetch(`/api/identity-documents/${docId}`)).status, 404, 'Talent → another person\'s KTP: DENY');
    assert.equal((await t.fetch('/hr')).status, 403, 'Talent stays on Talent surfaces');
    PASS('Talent own document; cross-person denied');

    // Audit.
    const audit = await db`SELECT action, decision, reason FROM sensitive_access_log`;
    for (const [a, d] of [['login', 'allow'], ['otp_login_send', 'allow'], ['otp_login_verify', 'allow'], ['step_up', 'allow'], ['identity_document.upload', 'allow'], ['identity_document.upload', 'deny'], ['identity_document.read', 'allow'], ['identity_document.read', 'deny'], ['capability_grant', 'allow'], ['logout_all', 'allow'], ['user_deactivate', 'allow'], ['logout', 'allow']])
      assert.ok(audit.some((r) => r.action === a && r.decision === d), `audited: ${a} ${d}`);
    assert.ok(!JSON.stringify(await db`SELECT * FROM sensitive_access_log`).includes(NIK));
    PASS(`audit: ${audit.length} rows, every required event present, no sensitive values`);
  } finally { await db.end(); }

  for (const leak of [NIK, MARKER, ...inbox.map((m) => m.match(/Kode Anda: (\d{6})/)?.[1]).filter(Boolean).map((c) => `Kode Anda: ${c}`)])
    assert.ok(!output.includes(leak), 'server output contains a sensitive value');
  PASS('server logs carry no code, NIK or document bytes');
} catch (error) {
  console.error(output.slice(-4000));
  throw error;
} finally {
  app?.kill('SIGTERM');
  pg.kill('SIGTERM');
  await s3.close();
  smtp.close();
}
