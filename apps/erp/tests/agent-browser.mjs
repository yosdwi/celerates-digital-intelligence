// Browser verification of the Agent shell (spike S1 + M1 demo flow). Disposable local harness only.
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
    await panel.getByText('Requisition belum memiliki TA PIC: 1 requisition memenuhi aturan ini.', { exact: false }).waitFor({ timeout: 30000 });
    assert.ok(lazy.length > chunksBeforeAsk, 'assistant-ui thread chunk loads only when Tanya opens');
    for (const badge of ['Sinyal', 'Fakta ERP', 'Pengetahuan disetujui']) await panel.getByText(badge, { exact: true }).first().waitFor();
    assert.equal(await panel.getByText('Tidak dibagikan ke Agent:', { exact: false }).count() > 0, true, 'withheld fields are named, not shown');
    await panel.getByText('Jejak alat Agent', { exact: true }).click();
    await panel.getByText('erp_read_entity', { exact: true }).waitFor();
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: evidenceDir + '/agent-m1-tanyakan-desktop.png' });

    // Keyword search through the composer (no model).
    await panel.getByLabel('Pesan untuk Agent').fill('Synthetic');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    await panel.getByText('Pencarian kata kunci "Synthetic"', { exact: false }).waitFor({ timeout: 30000 });

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

    // S1: a proposal-shaped tool call renders read-only (M3 contract), injected at the transport boundary.
    await page.route('**/api/agent/ag-ui', (route) => route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        { type: 'RUN_STARTED', threadId: 't', runId: 'fixture' },
        { type: 'TOOL_CALL_START', toolCallId: 'p1', toolCallName: 'propose_commands' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'p1', delta: JSON.stringify({ commands: [{ kind: 'task.create', summary: 'Buat task tindak lanjut untuk REQ-FIXTURE' }] }) },
        { type: 'TOOL_CALL_END', toolCallId: 'p1' },
        { type: 'RUN_FINISHED', threadId: 't', runId: 'fixture' },
      ].map((e, i) => `id: ${i + 1}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
    }));
    await panel.getByLabel('Pesan untuk Agent').fill('fixture');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    const proposal = panel.locator('[data-proposal]');
    await proposal.getByText('Buat task tindak lanjut untuk REQ-FIXTURE', { exact: true }).waitFor();
    assert.equal(await proposal.getByRole('button').count(), 0, 'no confirm control outside ERP proposal flow');
    await page.unroute('**/api/agent/ag-ui');

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
    console.log('PASS: Agent browser — Tanyakan with typed evidence, lazy thread chunk, keyword search, entity context, read-only proposal rendering, keyboard and mobile');
  } finally {
    await browser.close();
  }
}
