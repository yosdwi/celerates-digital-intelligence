// Browser verification of the Agent shell and its three journeys. Disposable local harness only.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

export async function agentBrowser({ base, cookies }) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ERP_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const evidenceDir = process.env.ERP_SCREENSHOT_DIR || '../../docs/implementation/evidence';
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: base })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const lazy = [];
    page.on('request', (r) => { if (/\/_next\/static\/chunks\//.test(r.url())) lazy.push(r.url()); });
    await page.goto(base + '/sales');
    const trigger = page.getByRole('button', { name: /^Celerates Agent/ });
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Celerates Agent' });
    const group = panel.locator('article').filter({ has: page.getByRole('heading', { name: 'Requisition belum memiliki TA PIC', exact: true }) });
    await group.waitFor();
    const chunksBeforeAsk = lazy.length;
    await group.getByRole('button', { name: 'Tanyakan: Requisition belum memiliki TA PIC' }).click();
    await panel.getByRole('button', { name: 'Tanya', exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Tanya', exact: true }).getAttribute('aria-pressed'), 'true');
    await panel.getByText(/Requisition belum memiliki TA PIC: \d+ requisition memenuhi aturan ini\./).waitFor({ timeout: 30000 });
    assert.ok(lazy.length > chunksBeforeAsk, 'assistant-ui thread chunk loads only when Tanya opens');
    for (const badge of ['Sinyal', 'Fakta ERP', 'Pengetahuan disetujui']) await panel.getByText(badge, { exact: true }).first().waitFor();
    assert.equal(await panel.getByText('Tidak dibagikan ke Agent:', { exact: false }).count() > 0, true, 'withheld fields are named, not shown');
    await panel.getByText('Jejak alat Agent', { exact: true }).click();
    await panel.getByText('erp_read_entity', { exact: true }).first().waitFor();
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: evidenceDir + '/agent-m1-tanyakan-desktop.png' });

    // Ask anything through the composer (no model): records, and a rule with a next step.
    await panel.getByLabel('Pesan untuk Agent').fill('Synthetic');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    await panel.getByText(/record ERP cocok dengan/).first().waitFor({ timeout: 30000 });
    await panel.getByLabel('Pesan untuk Agent').fill('requisition mana yang belum punya TA PIC?');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    await panel.getByRole('button', { name: 'Tindak lanjuti: Requisition belum memiliki TA PIC' }).waitFor({ timeout: 30000 });
    await page.screenshot({ path: evidenceDir + '/agent-ask.png' });

    // Perlu perhatian and Masukan remain intact inside the Agent.
    await panel.getByRole('button', { name: 'Perlu perhatian', exact: true }).click();
    await panel.getByRole('heading', { name: 'Requisition belum memiliki TA PIC', exact: true }).waitFor();
    assert.equal(await panel.locator('[data-agent-console-link]').getAttribute('href'), '/api/agent/console', 'Owner sees the Brain Console link');
    await panel.getByRole('button', { name: 'Masukan', exact: true }).click();
    await panel.getByLabel('Judul', { exact: true }).waitFor();

    // Page entity context on a record page.
    await page.keyboard.press('Escape');
    await page.goto(base + '/sales/opportunity-tracker');
    const link = page.locator('a[href*="/sales/opportunity-tracker/"][href$="/edit"]').first();
    await page.goto(base + (await link.getAttribute('href')));
    await trigger.click();
    await panel.locator('[data-agent-context]').filter({ hasText: 'Opportunity' }).waitFor();
    await panel.getByRole('button', { name: 'Tanya', exact: true }).click();
    await panel.getByRole('button', { name: /^Jelaskan Opportunity/ }).click();
    await panel.getByText('Relasi:', { exact: false }).first().waitFor({ timeout: 30000 });
    await page.screenshot({ path: evidenceDir + '/agent-m1-entity-desktop.png' });

    // Journey C in the UI: Perlu perhatian → Tindak lanjuti → ERP-held proposal → choose PIC → Konfirmasi.
    await page.keyboard.press('Escape');
    await page.goto(base + '/ta');
    await trigger.click();
    const unassigned = panel.locator('article').filter({ has: page.getByRole('heading', { name: 'Requisition belum memiliki TA PIC', exact: true }) });
    await unassigned.getByRole('button', { name: 'Tindak lanjuti: Requisition belum memiliki TA PIC' }).click();
    const card = panel.locator('[data-proposal][data-proposal-state="pending"]');
    await card.waitFor({ timeout: 30000 });
    const item = card.locator('[data-proposal-item="needs_input"]').filter({ hasText: 'REQ-BROWSER' });
    await item.getByRole('combobox').selectOption('Budi Synthetic');
    assert.equal(await item.getByRole('checkbox').isChecked(), true, 'completing the field includes the item');
    await page.screenshot({ path: evidenceDir + '/agent-proposal-follow-up.png' });
    await card.getByRole('button', { name: /^Konfirmasi 1 perubahan/ }).click();
    await panel.locator('[data-proposal][data-proposal-state="applied"]').waitFor({ timeout: 30000 });
    await panel.getByText('TA PIC REQ-BROWSER = Budi Synthetic', { exact: false }).waitFor();
    await panel.getByRole('button', { name: 'Perlu perhatian', exact: true }).click();
    await panel.locator('[data-agent-follow-ups]').getByText('Tindak lanjut: Requisition belum memiliki TA PIC', { exact: false }).first().waitFor();
    await panel.locator('[data-follow-up="applied"]').filter({ hasText: '1 dari 1 tuntas' }).first().waitFor();

    // Journey B in the UI: attach a CSV → mapping evidence → per-row validation → Konfirmasi.
    await panel.getByRole('button', { name: 'Tanya', exact: true }).click();
    await panel.locator('[data-agent-file]').setInputFiles({ name: 'kebutuhan-browser.csv', mimeType: 'text/csv', buffer: Buffer.from('Client,Position,Headcount\nPT Synthetic Browser Import,Product Designer,2\n') });
    const imported = panel.locator('[data-proposal][data-proposal-state="pending"]').last();
    await imported.waitFor({ timeout: 30000 });
    await panel.getByText('Berkas Anda', { exact: true }).last().waitFor();
    await panel.getByText('Inferensi', { exact: true }).last().waitFor();
    await page.screenshot({ path: evidenceDir + '/agent-proposal-import.png' });
    await imported.getByRole('button', { name: /^Konfirmasi 1 perubahan/ }).click();
    await panel.locator('[data-proposal][data-proposal-state="applied"]').last().getByText('dibuat', { exact: false }).waitFor({ timeout: 30000 });

    // Journey B with a correction: unknown headers → mapping card → user maps a column → proposal.
    await panel.locator('[data-agent-file]').setInputFiles({ name: 'catatan-browser.csv', mimeType: 'text/csv', buffer: Buffer.from('Nama Kandidat,Nilai\nFollow up kandidat A,90\n') });
    const mapping = panel.locator('[data-mapping-card][open]').last();
    await mapping.waitFor({ timeout: 30000 });
    await mapping.getByLabel('Impor sebagai').selectOption({ label: 'Buat task tindak lanjut' });
    await mapping.getByLabel(/^Judul/).selectOption('Nama Kandidat');
    await mapping.getByRole('button', { name: 'Siapkan usulan' }).click();
    const corrected = panel.locator('[data-proposal][data-proposal-state="pending"]').last();
    await corrected.getByText('Task: Follow up kandidat A', { exact: false }).waitFor({ timeout: 30000 });
    await corrected.getByRole('button', { name: /^Konfirmasi 1 perubahan/ }).click();
    await panel.locator('[data-proposal][data-proposal-state="applied"]').last().getByText(/TASK-\d+ dibuat/).waitFor({ timeout: 30000 });
    await page.screenshot({ path: evidenceDir + '/agent-import-mapping.png' });

    // Keyboard and mobile.
    await page.keyboard.press('Escape');
    assert.equal(await panel.count(), 0);
    assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    await page.setViewportSize({ width: 390, height: 844 });
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    await trigger.click();
    await panel.getByRole('button', { name: 'Tanya', exact: true }).click();
    const box = await panel.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0, 'mobile panel stays in viewport');
    // The pre-existing ERP layout is not yet mobile-responsive; the Agent panel must not add overflow of its own.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), pageWidth, 'panel adds no horizontal overflow');
    await page.screenshot({ path: evidenceDir + '/agent-m1-mobile.png' });
    assert.deepEqual(errors, [], 'no browser runtime exceptions');
    console.log('PASS: Agent browser — Tanyakan with typed evidence, lazy thread chunk, keyword search, entity context, follow-up and file import confirmed in ERP, keyboard and mobile');
  } finally {
    await browser.close();
  }
}

/** With an Agent model configured: the answer text is labelled as inference and its citations match evidence cards. */
export async function agentModelBrowser({ base, cookies }) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ERP_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const evidenceDir = process.env.ERP_SCREENSHOT_DIR || '../../docs/implementation/evidence';
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['microphone'] });
    await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: base })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/ta');
    await page.getByRole('button', { name: /^Celerates Agent/ }).click();
    const panel = page.getByRole('dialog', { name: 'Celerates Agent' });
    await panel.getByRole('button', { name: 'Tanya', exact: true }).click();
    // Push-to-talk with Chromium's fake microphone: the transcript lands in the composer; the user sends it.
    await panel.getByRole('button', { name: 'Bicara (tekan untuk merekam)' }).click();
    await panel.locator('[data-agent-voice="recording"]').waitFor();
    await page.waitForTimeout(1200);
    await panel.getByRole('button', { name: 'Berhenti merekam' }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Pesan untuk Agent"]')?.value === 'Siapa saja yang belum ditugasi recruiter?', null, { timeout: 30000 });
    assert.equal(await panel.locator('[data-agent-message]').count(), 0, 'voice alone sends nothing');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    const line = panel.locator('[data-provenance="model"]');
    await line.waitFor({ timeout: 30000 });
    await line.getByText('Inferensi', { exact: true }).waitFor();
    const cited = (await line.textContent()).match(/\(([^)]*)\)/)[1].split(', ');
    for (const id of cited) await panel.locator('[data-evidence-type]').filter({ hasText: id }).first().waitFor();
    // Answer feedback: the user says the answer was incomplete (an observation for the Brain Console).
    const fb = panel.locator('[data-agent-message]').last().locator('[data-answer-feedback]');
    await fb.getByRole('button', { name: 'Jawaban tidak membantu' }).click();
    await fb.getByRole('radio', { name: 'Kurang lengkap' }).click();
    await fb.getByLabel('Catatan (opsional)').fill('Sebutkan nomor requisition-nya');
    await page.screenshot({ path: evidenceDir + '/agent-model-inference.png' });
    await fb.getByRole('button', { name: 'Kirim umpan balik' }).click();
    await panel.locator('[data-answer-feedback="saved"]').last().waitFor();
    // Drop a request letter (PDF): the Agent reads it and prepares requisitions for the user to confirm in ERP.
    const { pdfBytes } = await import('./agent-journey.mjs');
    await panel.locator('[data-agent-file]').setInputFiles({ name: 'surat-permintaan.pdf', mimeType: 'application/pdf', buffer: pdfBytes(['SURAT PERMINTAAN TENAGA KERJA', 'PT Synthetic Browser Letter membutuhkan 3 Frontend Engineer mulai 1 November 2026.']) });
    await panel.locator('[data-agent-attachment]').getByText('surat-permintaan.pdf', { exact: false }).waitFor();
    const card = panel.locator('[data-proposal][data-proposal-state="pending"]').last();
    await card.getByText('PT Synthetic Browser Letter — Frontend Engineer (3 orang)', { exact: false }).waitFor({ timeout: 30000 });
    await panel.getByText('Berkas Anda', { exact: true }).first().waitFor();
    await page.screenshot({ path: evidenceDir + '/agent-document-proposal.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: Agent browser (model) — push-to-talk transcript reviewed then sent, answer labelled Inferensi, every cited id has an evidence card; dropped PDF → requisition proposal');
  } finally {
    await browser.close();
  }
}

/** Brain Console (Intelligence web): the Agent's runs, reasoning, decisions and learned mappings, read-only. */
export async function consoleBrowser({ env, python, base, cookies }) {
  const { spawn } = await import('node:child_process');
  const api = spawn(python, ['-m', 'uvicorn', 'cdi.api:app', '--host', '127.0.0.1', '--port', '8000'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  const web = spawn(process.execPath, ['../web/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173'], { cwd: '../web', env, stdio: ['ignore', 'ignore', 'inherit'] });
  const evidenceDir = process.env.ERP_SCREENSHOT_DIR || '../../docs/implementation/evidence';
  let browser;
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch('http://127.0.0.1:8000/ready')).ok && (await fetch('http://127.0.0.1:5173')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.ERP_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox'] });
    // Signed in from ERP (ADR-016): the Owner's ERP session mints a console-scoped assertion; no workspace token.
    const redirect = await fetch(base + '/api/agent/console', { headers: { Cookie: cookies }, redirect: 'manual' });
    assert.equal(redirect.status, 303);
    const fragment = new URL(redirect.headers.get('location')).hash;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:5173/app/agent' + fragment);
    assert.equal(new URL(page.url()).hash, '', 'sign-in removed from the address bar');
    assert.deepEqual(await page.locator('.sidebar nav a').allTextContents(), ['Agent & learning'], 'ERP sign-in opens the Brain Console only');
    await page.getByRole('heading', { name: 'What the Agent did, and what it learned.' }).waitFor({ timeout: 30000 });
    await page.locator('[data-console-reasoning]').getByText('model (openai/fake-agent)', { exact: false }).waitFor();
    await page.locator('[data-console-learned]').getByText('requisition.create', { exact: true }).first().waitFor();
    const runs = page.locator('[data-console-runs] tbody tr');
    await page.locator('[data-console-runs]').getByText('suara', { exact: true }).first().waitFor();
    assert.ok((await runs.count()) >= 10, 'recent runs listed');
    const modelRow = runs.filter({ hasText: 'Model · inferensi' }).filter({ hasText: 'recruiter' }).first();
    await modelRow.getByRole('button', { name: 'Jejak' }).click();
    const dialog = page.getByRole('dialog', { name: 'Jejak run Agent' });
    await dialog.getByText(/JAWABAN · INFERENSI MODEL/).waitFor();
    await dialog.locator('code', { hasText: 'erp_signals' }).first().waitFor();
    // Quality loop: recorded model turns, the user's feedback, and saving the run as an evaluation case.
    await dialog.locator('[data-console-turns]').getByText('answer', { exact: true }).first().waitFor();
    await dialog.locator('[data-console-trace-feedback]').getByText('Sebutkan nomor requisition-nya', { exact: false }).waitFor();
    await dialog.getByRole('button', { name: 'Simpan sebagai kasus uji' }).click();
    await dialog.getByText('Tersimpan.', { exact: false }).waitFor();
    await page.screenshot({ path: evidenceDir + '/console-agent-trace.png' });
    await page.keyboard.press('Escape');
    await page.locator('[data-console-feedback]').getByText('Sebutkan nomor requisition-nya').waitFor();
    await page.locator('[data-console-cases] tbody tr').filter({ hasText: 'recruiter' }).first().waitFor();
    await page.getByRole('button', { name: 'Jalankan evaluasi' }).click();
    const evalRow = page.locator('[data-console-evals] tbody tr').filter({ hasText: 'openai/fake-agent' }).first();
    await evalRow.getByRole('button', { name: 'Rinci' }).waitFor({ timeout: 60000 });
    assert.match(await evalRow.textContent(), /100%.*100%/, 'plan valid and grounded on the replayed case');
    await evalRow.getByRole('button', { name: 'Rinci' }).click();
    await page.locator('[data-console-eval-detail]').getByText('recruiter', { exact: false }).first().waitFor();
    await page.screenshot({ path: evidenceDir + '/console-quality.png', fullPage: true });
    await page.screenshot({ path: evidenceDir + '/console-agent.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('heading', { name: 'What the Agent did, and what it learned.' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'console mobile overflow');
    assert.deepEqual(errors, []);
    console.log('PASS: Brain Console — reasoning mode, runs, trace with model turns, feedback, evaluation case saved and replayed against the model, learned mappings, mobile');
  } finally {
    await browser?.close();
    api.kill();
    web.kill();
  }
}
