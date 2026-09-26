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
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ERP_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const evidenceDir = process.env.ERP_SCREENSHOT_DIR || '../../docs/implementation/evidence';
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: base })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/ta');
    await page.getByRole('button', { name: /^Celerates Agent/ }).click();
    const panel = page.getByRole('dialog', { name: 'Celerates Agent' });
    await panel.getByRole('button', { name: 'Tanya', exact: true }).click();
    await panel.getByLabel('Pesan untuk Agent').fill('Siapa saja yang belum ditugasi recruiter?');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    const line = panel.locator('[data-provenance="model"]');
    await line.waitFor({ timeout: 30000 });
    await line.getByText('Inferensi', { exact: true }).waitFor();
    const cited = (await line.textContent()).match(/\(([^)]*)\)/)[1].split(', ');
    for (const id of cited) await panel.locator('[data-evidence-type]').filter({ hasText: id }).first().waitFor();
    await page.screenshot({ path: evidenceDir + '/agent-model-inference.png' });
    // Drop a request letter (PDF): the Agent reads it and prepares requisitions for the user to confirm in ERP.
    const { pdfBytes } = await import('./agent-journey.mjs');
    await panel.locator('[data-agent-file]').setInputFiles({ name: 'surat-permintaan.pdf', mimeType: 'application/pdf', buffer: pdfBytes(['SURAT PERMINTAAN TENAGA KERJA', 'PT Synthetic Browser Letter membutuhkan 3 Frontend Engineer mulai 1 November 2026.']) });
    await panel.locator('[data-agent-attachment]').getByText('surat-permintaan.pdf', { exact: false }).waitFor();
    const card = panel.locator('[data-proposal][data-proposal-state="pending"]').last();
    await card.getByText('PT Synthetic Browser Letter — Frontend Engineer (3 orang)', { exact: false }).waitFor({ timeout: 30000 });
    await panel.getByText('Berkas Anda', { exact: true }).first().waitFor();
    await page.screenshot({ path: evidenceDir + '/agent-document-proposal.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: Agent browser (model) — answer labelled Inferensi, every cited id has an evidence card; dropped PDF → requisition proposal');
  } finally {
    await browser.close();
  }
}
