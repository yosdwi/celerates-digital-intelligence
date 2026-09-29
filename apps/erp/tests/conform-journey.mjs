// Cross-repository closed loop (doc 21 §10): real ConForm (celerates-bast-digital) behind CONFORM_BASE_URL, a
// recording WhatsApp bridge that speaks the bridge's HTTP contract, and a PDF renderer that speaks ConForm's
// /internal/render-pdf contract. Runs only when CONFORM_REPO and CONFORM_DATABASE_URL are set.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
import { chromium } from 'playwright';

const BRIDGE_TOKEN = 'b'.repeat(40);
const TALENT_JID = '6281200000001@c.us';
const GROUP_JID = '120363000000000001@g.us';
const EMPLOYEE_ID = 'MTG-TF/E2E0001';
const TALENT_EMAIL = 'rina.talent@example.test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGPQ0HiERjAMIRIAQwwNTQX3y6MAAAAASUVORK5CYII=', 'base64');

const jakartaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function cycleOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return d <= 20 ? { year: y, month: m } : m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}
const prevOf = ({ year, month }) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 });
const iso = (d) => d.toISOString().slice(0, 10);
function periodOf({ year, month }) {
  const end = new Date(Date.UTC(year, month - 1, 20));
  const start = new Date(Date.UTC(month === 1 ? year - 1 : year, month === 1 ? 11 : month - 2, 21));
  return { start, end };
}
async function until(fn, label, tries = 160) {
  for (let i = 0; i < tries; i++) {
    try { if (await fn()) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Timeout: ' + label);
}
function run(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} failed:\n${out}`))));
  });
}

export async function conformJourney({ base, db, cookies }) {
  const repo = process.env.CONFORM_REPO;
  const dsn = process.env.CONFORM_DATABASE_URL;
  assert.ok(repo && dsn, 'CONFORM_REPO and CONFORM_DATABASE_URL are required');
  assert.equal(new URL(dsn).hostname, '127.0.0.1', 'disposable localhost database only');
  const conformBase = process.env.CONFORM_BASE_URL;
  const serviceToken = process.env.CONFORM_SERVICE_TOKEN;
  const port = Number(new URL(conformBase).port);
  const evidenceDir = process.env.ERP_SCREENSHOT_DIR || '../../docs/implementation/evidence';
  const exportsDir = await mkdtemp(tmpdir() + '/conform-exports-');

  // --- recording WhatsApp bridge (the whatsapp-web-session HTTP contract) ---------------------------------------
  const sent = [];
  const bridge = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.headers['x-bridge-token'] !== BRIDGE_TOKEN) { res.writeHead(403).end(); return; }
      if (req.method === 'POST' && ['/internal/v1/messages', '/internal/v1/group-messages'].includes(req.url)) {
        const payload = JSON.parse(body);
        const duplicate = sent.find((m) => m.request_id === payload.request_id);
        if (!duplicate) sent.push({ ...payload, group: req.url.includes('group') });
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'sent', provider_message_id: 'wamid.' + sent.length }));
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise((r) => bridge.listen(port + 1, '127.0.0.1', r));

  // --- PDF renderer (ConForm's bast-renderer contract), Chromium from the same pinned browser -------------------
  const renderBrowser = await chromium.launch({ headless: true, executablePath: process.env.ERP_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const renderer = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      if (req.method !== 'POST' || req.url !== '/internal/render-pdf') { res.writeHead(404).end(); return; }
      try {
        const page = await renderBrowser.newPage();
        await page.setContent(Buffer.concat(chunks).toString('utf8'), { waitUntil: 'domcontentloaded' });
        const pdf = await page.pdf({ format: 'A4' });
        await page.close();
        res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(pdf);
      } catch (error) {
        res.writeHead(500).end(String(error));
      }
    });
  });
  await new Promise((r) => renderer.listen(port + 2, '127.0.0.1', r));

  // --- ConForm: migrate, seed one Developer with one missing clock-in in the previous Payroll cycle -------------
  const conformEnv = {
    ...process.env,
    APP_ENVIRONMENT: 'development',
    APP_DATABASE_DSN: dsn,
    APP_SESSION_SECRET: randomBytes(32).toString('hex'),
    SYNC_INGEST_TOKEN: BRIDGE_TOKEN,
    BOT_BRIDGE_BASE_URL: `http://127.0.0.1:${port + 1}`,
    BAST_RENDERER_URL: `http://127.0.0.1:${port + 2}`,
    BAST_EXPORTS_DIR: exportsDir,
    CELERATES_SERVICE_TOKEN: serviceToken,
    CELERATES_PUBLIC_URL: base,
  };
  for (const key of ['DATABASE_URL', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET']) delete conformEnv[key];
  await run('uv', ['run', '--frozen', 'alembic', 'upgrade', 'head'], { cwd: repo, env: conformEnv });
  const cdb = postgres(dsn, { max: 2, prepare: false });
  const cycle = prevOf(cycleOf(jakartaToday()));
  const { start, end } = periodOf(cycle);
  let gapDay = null;
  await cdb`INSERT INTO employees (employee_id, nrp, full_name, role) VALUES (${EMPLOYEE_ID}, 'E2E0001', 'Rina Synthetic', 'Developer')`;
  await cdb`INSERT INTO wa_identity (wa_jid, employee_id) VALUES (${TALENT_JID}, ${EMPLOYEE_ID})`;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const day = iso(d);
    gapDay ??= day;
    await cdb`INSERT INTO attendance (record_key, employee_id, work_date, check_in, check_out) VALUES (${`attendance:${day}:${EMPLOYEE_ID}`}, ${EMPLOYEE_ID}, ${day}, ${day === gapDay ? null : '08:00'}, '17:00')`;
  }
  const taskDay = `${cycle.year}-${String(cycle.month).padStart(2, '0')}-01`;
  await cdb`INSERT INTO bast_evidence_rules (scope_key, task_category, evidence_required, updated_by) VALUES ('default', 'E2E Delivery', true, 'e2e') ON CONFLICT (scope_key, task_category) DO UPDATE SET evidence_required = true`;
  await cdb`INSERT INTO tasks (record_key, employee_id, work_date, title, status, category, task_source, source_id) VALUES ('task:e2e:1', ${EMPLOYEE_ID}, ${taskDay}, 'Synthetic deployment checklist', 'Closed', 'E2E Delivery', 'redmine', 'E2E-1')`;
  await cdb`INSERT INTO workflow_notification_settings (scope_key, payroll_closing_group_jid, updated_by) VALUES ('default', ${GROUP_JID}, 'e2e') ON CONFLICT (scope_key) DO UPDATE SET payroll_closing_group_jid = EXCLUDED.payroll_closing_group_jid`;
  await cdb`INSERT INTO source_sync_state (source_key, last_success_at) VALUES ('attendance', now() - interval '2 hours') ON CONFLICT (source_key) DO UPDATE SET last_success_at = EXCLUDED.last_success_at`;

  const api = (path, init = {}) => fetch(`${conformBase}/api/celerates/v1${path}`, { ...init, headers: { Authorization: `Bearer ${serviceToken}`, ...(init.headers || {}) } });
  const server = spawn('uv', ['run', '--frozen', 'uvicorn', 'digital_bast.web.asgi:app', '--host', '127.0.0.1', '--port', String(port)], { cwd: repo, env: conformEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let conformLog = '';
  server.stdout.on('data', (d) => (conformLog += d));
  server.stderr.on('data', (d) => (conformLog += d));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ERP_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    await until(async () => (await api('/meta')).ok, 'ConForm adapter');
    const q = `year=${cycle.year}&month=${cycle.month}`;
    const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true };

    // --- PMO: Operational Readiness in Celerates ------------------------------------------------------------------
    const pmo = await browser.newContext(phone);
    await pmo.addCookies(cookies.map(([name, value]) => ({ name, value, url: base })));
    const page = await pmo.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(page.url() + ': ' + e.message));
    await page.goto(`${base}/pmo/readiness?${q}`);
    await page.locator('[data-summary="needs_talent_action"]').getByText('1', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal scroll');
    await page.screenshot({ path: evidenceDir + '/conform-pmo-readiness.png', fullPage: true });

    // Identity: the Owner links the Talent's Celerates account to the ConForm employee (no JID in Celerates).
    await page.locator('[data-list-item]').filter({ hasText: 'Rina Synthetic' }).first().click();
    await page.waitForURL(/\/pmo\/readiness\/talent\//);
    await page.locator('[data-link-talent] input[name="email"]').fill(TALENT_EMAIL);
    await page.locator('[data-action="link-talent"]').click();
    await page.getByText(TALENT_EMAIL, { exact: true }).waitFor();
    const [talentUser] = await db`SELECT u.id, u.account_type, l.conform_employee_id FROM users u JOIN talent_identity_links l ON l.user_id=u.id AND l.status='active' WHERE u.email=${TALENT_EMAIL}`;
    assert.deepEqual([talentUser.account_type, talentUser.conform_employee_id], ['talent', EMPLOYEE_ID]);

    // Campaign: draft → Tinjau → approve (Celerates mints one grant per linked recipient).
    await page.goto(`${base}/pmo/readiness?${q}`);
    await page.locator('[data-record-section="actions"]').getByText('Pengingat Talent', { exact: true }).click();
    await page.locator('[data-action="campaign-create"]').click();
    await page.waitForURL(/\/review\/campaign\/[0-9a-f-]{36}$/);
    const campaignId = page.url().split('/').pop();
    await page.locator(`[data-recipient="${EMPLOYEE_ID}"][data-recipient-state="will_send"]`).waitFor();
    await page.goto(`${base}/review`);
    await page.locator('[data-review-item="campaign"]').waitFor();
    await page.locator('[data-review-item="campaign"] a').first().click();
    await page.waitForURL(`**/review/campaign/${campaignId}`);
    await page.screenshot({ path: evidenceDir + '/conform-campaign-review.png', fullPage: true });
    await page.locator('[data-action="campaign-approve"]').click();
    await page.locator('[data-action="campaign-confirm"]').click();
    await page.getByText('Berjalan', { exact: true }).first().waitFor({ timeout: 30000 });
    const [grantRow] = await db`SELECT count(*)::int AS n FROM talent_link_grants WHERE campaign_ref=${campaignId} AND used_at IS NULL`;
    assert.equal(grantRow.n, 1, 'one single-use grant per linked recipient');

    // Dispatcher tick (the pmo-notifications flow does this on its schedule). The sending window is opened for the
    // test so the run does not depend on the wall clock; batching and pacing are covered by ConForm unit tests.
    await cdb`UPDATE celerates_campaigns SET window_start_hour = 0, window_end_hour = 24 WHERE id = ${campaignId}`;
    const tick = await (await api('/campaigns/dispatch', { method: 'POST' })).json();
    assert.equal(tick.campaigns.find((c) => c.id === campaignId)?.sent, 1, JSON.stringify(tick));
    const dm = sent.find((m) => !m.group);
    assert.equal(dm.jid, TALENT_JID, 'personal DM to the ConForm-bound JID');
    assert.equal(dm.request_id, `celerates-campaign:${(await cdb`SELECT id FROM celerates_campaign_recipients WHERE campaign_id=${campaignId}`)[0].id}`);
    const link = dm.text.match(/https?:\/\/\S+\/go\/[A-Za-z0-9_-]+/)?.[0];
    assert.ok(link && link.startsWith(base), 'an opaque Celerates deep link');
    assert.doesNotMatch(dm.text, /MTG-TF|E2E0001|6281200000001/, 'no ids or phone numbers in the message');
    assert.equal((await api('/campaigns/dispatch', { method: 'POST' }).then((r) => r.json())).campaigns.length, 0, 'cooldown: no second batch');

    // --- Talent: the WhatsApp link opens Kelengkapan Saya for exactly this Talent --------------------------------
    const talentCtx = await browser.newContext(phone);
    const talent = await talentCtx.newPage();
    talent.on('pageerror', (e) => errors.push(talent.url() + ': ' + e.message));
    await talent.goto(link);
    await talent.waitForURL(`**/me?${q}`);
    await talent.locator(`[data-requirement="${gapDay}"][data-requirement-state="needs_action"]`).waitFor();
    assert.equal(await talent.locator('[data-mobile-tabbar], aside').count(), 0, 'no backoffice navigation for a Talent');
    await talent.screenshot({ path: evidenceDir + '/conform-talent-home.png' });
    await talent.locator(`[data-requirement="${gapDay}"] a`).click();
    await talent.waitForURL(`**/me/attendance/${gapDay}**`);
    await talent.locator('[data-action="talent-fix"]').click();
    const sheet = talent.getByRole('dialog', { name: 'Lengkapi attendance' });
    await sheet.locator('input[name="check_in"]').fill('08:00');
    await sheet.locator('[data-fix-file]').setInputFiles({ name: 'bukti.png', mimeType: 'image/png', buffer: PNG });
    await sheet.locator('textarea[name="caption"]').fill('Lupa tap masuk, di site sejak pagi.');
    await talent.screenshot({ path: evidenceDir + '/conform-talent-fix.png' });
    await talent.locator('[data-action="talent-fix-submit"]').click();
    await sheet.locator('[data-fix-done]').waitFor({ timeout: 30000 });
    await talent.goto(`${base}/me?${q}`);
    await talent.locator(`[data-requirement="${gapDay}"][data-requirement-state="waiting_review"]`).waitFor();
    // Absensi: the day log from ConForm (PAMA) shows the corrected day waiting for PMO.
    await talent.goto(`${base}/me/attendance?${q}`);
    await talent.locator(`[data-attendance-day="${gapDay}"][data-attendance-state="waiting_review"]`).waitFor();
    assert.ok((await talent.locator('[data-attendance-state="complete"]').count()) > 0, 'recorded days come from ConForm');
    assert.equal(await talent.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal scroll');
    await talent.screenshot({ path: evidenceDir + '/conform-talent-attendance.png', fullPage: true });
    // Task: stage evidence, then submit (no PMO approval).
    await talent.goto(`${base}/me/tasks?${q}`);
    await talent.locator('[data-task="task:e2e:1"][data-task-complete="0"]').waitFor();
    await talent.locator('[data-task="task:e2e:1"] [data-action="task-evidence"]').click();
    const taskSheet = talent.getByRole('dialog', { name: 'Bukti task' });
    await taskSheet.locator('[data-task-file]').setInputFiles({ name: 'task.png', mimeType: 'image/png', buffer: PNG });
    await talent.locator('[data-action="task-evidence-submit"]').click();
    await taskSheet.locator('[data-task-staged]').waitFor({ timeout: 30000 });
    await talent.keyboard.press('Escape');
    await talent.goto(`${base}/me/tasks?${q}`);
    await talent.screenshot({ path: evidenceDir + '/conform-talent-tasks.png', fullPage: true });
    await talent.locator('[data-action="task-submit"]').click();
    await talent.locator('[data-task-submitted]').waitFor({ timeout: 30000 });
    await talent.goto(`${base}/me/tasks?${q}`);
    await talent.locator('[data-task="task:e2e:1"][data-task-complete="1"]').waitFor();
    const [evidence] = await cdb`SELECT count(*)::int AS n FROM task_evidence e JOIN tasks t ON t.id = e.task_id WHERE t.record_key = 'task:e2e:1'`;
    assert.equal(evidence.n, 1, 'task evidence submitted to ConForm');

    // A Talent cannot reach backoffice pages or APIs.
    const forbidden = await talent.goto(`${base}/pmo/readiness`);
    assert.equal(forbidden.status(), 403, 'backoffice pages are refused to a Talent');
    await talent.waitForURL(`${base}/me`);
    assert.equal((await talent.request.get(`${base}/api/conform/corrections/00000000-0000-0000-0000-000000000000/evidence`)).status(), 403);

    // The grant was single-use; another account's session fails closed on a fresh grant, which stays unused.
    const reuse = await (await browser.newContext(phone)).newPage();
    await reuse.goto(link);
    await reuse.locator('[data-link-notice="invalid"]').waitFor();
    const code = randomBytes(32).toString('base64url');
    await db`INSERT INTO talent_link_grants (token_sha256, user_id, target_path, purpose, expires_at) VALUES (${createHash('sha256').update(code).digest('hex')}, ${talentUser.id}, '/me', 'manual', NULL)`;
    await page.goto(`${base}/go/${code}`);
    await page.locator('[data-link-notice="other-account"]').waitFor();
    assert.equal((await db`SELECT used_at FROM talent_link_grants WHERE token_sha256=${createHash('sha256').update(code).digest('hex')}`)[0].used_at, null, 'not consumed by another account');
    // The same Talent, already signed in, continues straight to the target and consumes the grant.
    await talent.goto(`${base}/go/${code}`);
    await talent.waitForURL(`${base}/me`);
    assert.notEqual((await db`SELECT used_at FROM talent_link_grants WHERE token_sha256=${createHash('sha256').update(code).digest('hex')}`)[0].used_at, null, 'consumed by its own user');

    // --- PMO decides in Tinjau; ConForm applies and re-projects ------------------------------------------------------
    await page.goto(`${base}/review`);
    await page.locator('[data-review-item="correction"] a').first().click();
    await page.waitForURL(/\/review\/correction\/[0-9a-f-]{36}$/);
    await page.locator('[data-correction-evidence] img').waitFor();
    assert.ok(await page.locator('[data-correction-evidence] img').evaluate((img) => img.naturalWidth > 0), 'evidence streamed through Celerates');
    await page.screenshot({ path: evidenceDir + '/conform-correction-review.png', fullPage: true });
    await page.locator('[data-action="correction-approve"]').click();
    await page.locator('[data-action="correction-confirm"]').click();
    await page.waitForURL('**/review');
    const [resolution] = await cdb`SELECT status, requested_by_jid, reviewed_by FROM attendance_resolution_requests WHERE employee_id=${EMPLOYEE_ID}`;
    assert.equal(resolution.status, 'approved');
    assert.equal(resolution.requested_by_jid, `celerates-talent:${talentUser.id}`);
    assert.match(resolution.reviewed_by, /^celerates:.+<owner@example\.test>$/);
    const after = await (await api(`/talents/requirements?employee_id=${encodeURIComponent(EMPLOYEE_ID)}&${q}`)).json();
    assert.deepEqual([after.talent.status, after.requirements.length], ['COMPLETE', 0], 'ConForm recalculated readiness');
    await talent.goto(`${base}/me?${q}`);
    await talent.locator('[data-talent-clear]').waitFor();
    await talent.screenshot({ path: evidenceDir + '/conform-talent-clear.png' });

    // --- PMO "Kirim pengingat": one personal DM with a fresh link; the Talent's older unused link stops working ------
    const stale = randomBytes(32).toString('base64url');
    await db`INSERT INTO talent_link_grants (token_sha256, user_id, target_path, purpose, expires_at) VALUES (${createHash('sha256').update(stale).digest('hex')}, ${talentUser.id}, '/me', 'manual', NULL)`;
    await page.goto(`${base}/pmo/readiness/talent/${encodeURIComponent(EMPLOYEE_ID)}?${q}`);
    await page.locator(`[data-attendance-day="${gapDay}"]`).waitFor();
    await page.locator('[data-action="talent-message"]').click();
    await page.locator('[data-action="talent-message-confirm"]').click();
    await page.locator('[data-talent-message-sent]').waitFor({ timeout: 30000 });
    await page.screenshot({ path: evidenceDir + '/conform-pmo-talent-message.png', fullPage: true });
    const direct = sent.filter((m) => !m.group && m.request_id.startsWith('celerates-direct:'));
    assert.equal(direct.length, 1);
    assert.equal(direct[0].jid, TALENT_JID);
    assert.doesNotMatch(direct[0].text, /MTG-TF|E2E0001|6281200000001/, 'no ids or phone numbers in the message');
    const directLink = direct[0].text.match(/https?:\/\/\S+\/go\/[A-Za-z0-9_-]+/)?.[0];
    assert.ok(directLink && directLink.startsWith(base));
    assert.equal((await db`SELECT superseded_at FROM talent_link_grants WHERE token_sha256=${createHash('sha256').update(stale).digest('hex')}`)[0].superseded_at === null, false, 'older unused link superseded');
    await page.locator('[data-action="talent-message"]').click();
    await page.locator('[data-action="talent-message-confirm"]').click();
    await page.getByText('Talent ini baru saja dikirimi pesan. Tunggu 10 menit.').waitFor();
    const fresh = await (await browser.newContext(phone)).newPage();
    await fresh.goto(directLink);
    await fresh.waitForURL(`**/me?${q}`);
    await fresh.locator('[data-talent-home]').waitFor();

    // --- WhatsApp re-entry ("masuk"): ConForm asks Celerates for a fresh link with the shared service token ----------
    const internal = (body, token = serviceToken) => fetch(`${base}/api/internal/talent/links`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await internal({ employee_id: EMPLOYEE_ID }, 'x'.repeat(48))).status, 401);
    assert.equal((await internal({ employee_id: 'MTG-TF/UNKNOWN' })).status, 404);
    const reentry = await (await internal({ employee_id: EMPLOYEE_ID })).json();
    assert.ok(reentry.url.startsWith(`${base}/go/`) && reentry.expires_at === null, JSON.stringify(reentry));
    const again = await (await browser.newContext(phone)).newPage();
    await again.goto(reentry.url);
    await again.waitForURL(`${base}/me`);

    // A new campaign excludes the resolved Talent.
    await page.goto(`${base}/pmo/readiness?${q}`);
    await page.locator('[data-summary="complete"]').getByText('1', { exact: true }).waitFor();
    await page.locator('[data-record-section="actions"]').getByText('Pengingat Talent', { exact: true }).click();
    await page.locator('[data-action="campaign-create"]').click();
    await page.waitForURL(/\/review\/campaign\/[0-9a-f-]{36}$/);
    await page.locator('[data-campaign-empty]').waitFor();
    await page.locator('[data-action="campaign-cancel"]').click();
    await page.getByText('Dihentikan', { exact: true }).first().waitFor();

    // --- Canonical CSV from ConForm's exporter, downloaded in Celerates ----------------------------------------------
    await page.goto(`${base}/pmo/readiness?${q}`);
    await page.locator('[data-record-section="actions"]').getByText('Export attendance CSV', { exact: true }).click();
    const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="csv-export"]').click()]);
    const csv = await readFile(await csvDownload.path(), 'utf8');
    const [y, m, d] = gapDay.split('-');
    const gapLine = csv.split(/\r?\n/).find((line) => line.includes(`${d}/${m}/${y}`) && line.includes('E2E0001'));
    assert.ok(gapLine && gapLine.includes('08:00'), 'the canonical CSV carries the approved correction: ' + gapLine);
    const [exportRow] = await cdb`SELECT exported_by FROM payroll_export_history ORDER BY exported_at DESC LIMIT 1`;
    assert.match(exportRow.exported_by, /^celerates:/);

    // --- Canonical BAST from ConForm's generator, downloaded in Celerates --------------------------------------------
    await page.goto(`${base}/pmo/readiness?${q}`);
    await page.locator('[data-record-section="actions"]').getByText('Generate BAST', { exact: true }).click();
    await page.locator('select[name="mode"]').selectOption('preview');
    await page.locator('[data-action="bast-generate"]').click();
    await page.locator('[data-bast-job="succeeded"]').waitFor({ timeout: 240000 });
    await page.screenshot({ path: evidenceDir + '/conform-bast-generated.png' });
    const [pdfDownload] = await Promise.all([page.waitForEvent('download'), page.locator('[data-bast-download]').click()]);
    const pdf = await readFile(await pdfDownload.path());
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    const [audit] = await cdb`SELECT mode, generated_by FROM bast_generation_audit ORDER BY created_at DESC LIMIT 1`;
    assert.deepEqual([audit.mode, /^celerates:/.test(audit.generated_by)], ['preview', true]);

    // --- PMO group: one aggregate summary with a Celerates link ---------------------------------------------------------
    await page.goto(`${base}/pmo/readiness?${q}`);
    await page.locator('[data-record-section="actions"]').getByText('Ringkasan ke grup PMO', { exact: true }).click();
    await page.locator('[data-summary-preview]').waitFor();
    await page.locator('[data-action="summary-send"]').click();
    await page.locator('[data-summary-sent]').waitFor();
    const group = sent.filter((msg) => msg.group);
    assert.equal(group.length, 1);
    assert.equal(group[0].jid, GROUP_JID);
    assert.match(group[0].text, new RegExp(`${base.replace(/[.:/]/g, (c) => '\\' + c)}/pmo/readiness`));

    // Desktop keeps working with the same page.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/pmo/readiness?${q}`);
    await page.locator('[data-readiness-summary]').waitFor();
    await page.screenshot({ path: evidenceDir + '/conform-pmo-readiness-desktop.png' });
    assert.deepEqual(errors, [], 'no browser runtime exceptions');
    console.log(`PASS: ConForm closed loop — ConForm gap → approved Celerates campaign → personal WhatsApp deep link → Talent correction in Celerates → PMO approval in Tinjau → ConForm re-projection (complete) → next campaign excludes → canonical CSV carries 08:00; BAST preview generated by ConForm and downloaded in Celerates; PMO group summary; single-use grant, other-account fail-closed, Talent confined to /me; Absensi from ConForm; task evidence staged and submitted; PMO direct reminder (supersedes older link, 10-minute dedupe); WhatsApp re-entry link`);
  } catch (error) {
    console.error(conformLog.slice(-6000));
    throw error;
  } finally {
    await browser.close();
    await renderBrowser.close();
    server.kill();
    bridge.close();
    renderer.close();
    await cdb.end();
  }
}
