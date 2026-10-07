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
    page.on('pageerror', (e) => errors.push(page.url() + ': ' + e.message));
    const lazy = [];
    page.on('request', (r) => { if (/\/_next\/static\/chunks\//.test(r.url())) lazy.push(r.url()); });
    await page.goto(base + '/sales');
    await page.waitForLoadState('networkidle');
    const chunksBeforeOpen = lazy.length;
    const trigger = page.getByRole('button', { name: /^Celerates Agent/ });
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Celerates Agent' });
    // One surface (ADR-017): no tabs. Perlu perhatian is the Ringkasan above the one conversation and composer.
    assert.equal(await panel.getByRole('button', { name: 'Tanya', exact: true }).count(), 0, 'no separate Tanya tab');
    // Perlu perhatian starts folded (QA round 2: the drawer leads with the conversation); one click opens it.
    await panel.locator('[data-agent-summary="folded"]').waitFor();
    await panel.getByRole('button', { name: /^Perlu perhatian/ }).click();
    await panel.locator('[data-agent-summary="open"]').waitFor();
    await panel.getByLabel('Pesan untuk Agent').waitFor();
    const group = panel.locator('[data-agent-summary] article').filter({ has: page.getByRole('heading', { name: 'Requisition belum memiliki TA PIC', exact: true }) });
    await group.waitFor();
    assert.ok(lazy.length > chunksBeforeOpen, 'the assistant-ui thread chunk loads when the Agent opens, not with the page');
    await page.screenshot({ path: evidenceDir + '/agent-one-surface.png' });
    await group.getByRole('button', { name: 'Tanyakan: Requisition belum memiliki TA PIC' }).click();
    await panel.getByText(/Requisition belum memiliki TA PIC: \d+ requisition memenuhi aturan ini\./).waitFor({ timeout: 30000 });
    await panel.locator('[data-agent-summary="folded"]').waitFor();
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

    // Free text that is feedback (no model): the kinds are offered; the chosen one becomes a draft to review.
    await panel.getByLabel('Pesan untuk Agent').fill('Filter customer di halaman ini harusnya multi-select');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    await panel.getByText('Ini terdengar seperti masukan', { exact: false }).waitFor({ timeout: 30000 });
    await panel.getByRole('button', { name: 'Jadikan Feature Request' }).last().click();
    const frCard = panel.locator('[data-proposal][data-proposal-state="pending"]').last();
    await frCard.getByText('Filter customer', { exact: false }).first().waitFor({ timeout: 30000 });
    await page.screenshot({ path: evidenceDir + '/agent-masukan-routed.png' });
    await frCard.getByRole('button', { name: /^Konfirmasi 1 perubahan/ }).click();
    await panel.locator('[data-proposal][data-proposal-state="applied"]').last().getByText(/FR-\d+-\d+ dibuat/).waitFor({ timeout: 30000 });

    // Perlu perhatian and the Masukan form remain intact inside the one surface.
    await panel.getByRole('button', { name: /^Perlu perhatian/ }).click();
    await panel.locator('[data-agent-summary]').getByRole('heading', { name: 'Requisition belum memiliki TA PIC', exact: true }).waitFor();
    assert.equal(await panel.locator('[data-agent-console-link]').getAttribute('href'), '/api/agent/console', 'Owner sees the Brain Console link');
    await panel.locator('[data-signal-trend]').first().getByText('Observasi').waitFor();
    await panel.locator('[data-signal-trend]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: evidenceDir + '/agent-signal-trend.png' });
    await panel.getByRole('button', { name: 'Formulir masukan', exact: true }).click();
    await panel.getByLabel('Judul', { exact: true }).waitFor();
    await panel.getByRole('button', { name: '← Kembali ke Agent', exact: true }).click();

    // Page entity context on a record page.
    await page.keyboard.press('Escape');
    await page.goto(base + '/sales/opportunity-tracker');
    const link = page.locator('a[href*="/sales/opportunity-tracker/"][href$="/edit"]').first();
    await page.goto(base + (await link.getAttribute('href')));
    await trigger.click();
    await panel.locator('[data-agent-context]').filter({ hasText: 'Opportunity' }).waitFor();
    await panel.getByRole('button', { name: /^Jelaskan Opportunity/ }).click();
    await panel.getByText('Relasi:', { exact: false }).first().waitFor({ timeout: 30000 });
    await page.screenshot({ path: evidenceDir + '/agent-m1-entity-desktop.png' });

    // Journey C in the UI: Perlu perhatian → Tindak lanjuti → ERP-held proposal → choose PIC → Konfirmasi.
    await page.keyboard.press('Escape');
    await page.goto(base + '/ta');
    await trigger.click();
    await panel.getByRole('button', { name: /^Perlu perhatian/ }).click();
    const unassigned = panel.locator('[data-agent-summary] article').filter({ has: page.getByRole('heading', { name: 'Requisition belum memiliki TA PIC', exact: true }) });
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
    await panel.getByRole('button', { name: /^Perlu perhatian/ }).click();
    await panel.locator('[data-agent-follow-ups]').getByText('Tindak lanjut: Requisition belum memiliki TA PIC', { exact: false }).first().waitFor();
    await panel.locator('[data-follow-up="applied"]').filter({ hasText: '1 dari 1 tuntas' }).first().waitFor();

    // Journey B in the UI: attach a CSV → mapping evidence → per-row validation → Konfirmasi.
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

    // Company Files (ADR-018): the explorer finds indexed files with their class; an upload is queued for reading;
    // the Agent finds a file and the user asks about it in the same conversation.
    await page.keyboard.press('Escape');
    await page.goto(base + '/files?q=onboarding');
    const results = page.locator('[data-files-results]');
    await results.getByText('sop-onboarding', { exact: false }).first().waitFor({ timeout: 30000 });
    await results.locator('[data-file-class="general"]').first().waitFor();
    await results.locator('[data-file-row]').first().click();
    const detail = page.locator('[data-file-detail]');
    await detail.locator('[data-file-ingest="indexed"]').waitFor();
    assert.match(await detail.locator('[data-file-open]').getAttribute('href'), /^\/api\/files\/[0-9a-f-]+\/content\?preview=1$/);
    await page.screenshot({ path: evidenceDir + '/files-explorer.png' });
    await page.getByRole('button', { name: 'Tutup detail' }).click();
    await page.getByRole('button', { name: 'Unggah', exact: true }).click();
    const upload = page.locator('[data-files-upload]');
    await upload.locator('input[type=file]').setInputFiles({ name: 'template-bast.txt', mimeType: 'text/plain', buffer: Buffer.from('Template BAST: isi periode, lingkup pekerjaan, dan tanda tangan kedua pihak.') });
    await upload.getByLabel('Jenis').selectOption('template');
    await upload.getByRole('button', { name: 'Unggah' }).click();
    await page.locator('[data-file-detail] [data-file-ingest="queued"]').waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Tutup detail' }).click();
    await trigger.click();
    await panel.getByLabel('Pesan untuk Agent').fill('cari berkas sop onboarding');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    const fileCard = panel.locator('[data-evidence-type="file"]').filter({ hasText: 'sop-onboarding' }).first();
    await fileCard.waitFor({ timeout: 30000 });
    await fileCard.locator('[data-file-ask]').click();
    await panel.locator('[data-agent-attachment]').getByText('sop-onboarding', { exact: false }).waitFor();
    await panel.getByLabel('Pesan untuk Agent').fill('kapan laptop disiapkan?');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    const answer = panel.locator('[data-agent-message]').last();
    await answer.getByText(/Dari sop-onboarding/).waitFor({ timeout: 30000 });
    await answer.locator('[data-evidence-type="file"]').filter({ hasText: 'hal. 1' }).first().waitFor();
    await page.screenshot({ path: evidenceDir + '/agent-company-file.png' });
    await panel.locator('[data-agent-attachment]').getByRole('button', { name: 'Lepas berkas' }).click();
    // M6.x: a scan dropped in the Agent cannot be read there; it can be saved as a Company File (read with OCR).
    const { pdfBytes } = await import('./agent-journey.mjs');
    await panel.locator('[data-agent-file]').setInputFiles({ name: 'bast-scan.pdf', mimeType: 'application/pdf', buffer: pdfBytes([]) });
    const scan = panel.locator('[data-agent-attachment="local"]');
    await scan.waitFor({ timeout: 30000 });
    await scan.locator('[data-attachment-save]').click();
    const saveForm = scan.locator('[data-attachment-save-form]');
    await saveForm.locator('select[name="kind"]').selectOption('bast');
    await saveForm.locator('select[name="owner_division"]').selectOption('pmo');
    await page.screenshot({ path: evidenceDir + '/agent-save-to-files.png' });
    await saveForm.getByRole('button', { name: 'Simpan', exact: true }).click();
    await scan.locator('[data-attachment-saved]').getByText('Tersimpan di Company Files', { exact: false }).waitFor({ timeout: 30000 });
    await scan.getByRole('button', { name: 'Lepas berkas' }).click();

    // Keyboard and mobile.
    await page.keyboard.press('Escape');
    assert.equal(await panel.count(), 0);
    assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    // MS1 mobile shell (doc 18 §14): no sidebar, tab bar, the same Agent opened from the Agent tab, full screen.
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('aside').first().isVisible(), false, 'no desktop sidebar on a phone');
    assert.equal(await trigger.isVisible(), false, 'the floating trigger gives way to the Agent tab');
    const tabbar = page.locator('[data-mobile-tabbar]');
    await tabbar.waitFor();
    await tabbar.locator('[data-tab-agent]').click();
    await panel.getByLabel('Pesan untuk Agent').waitFor();
    const box = await panel.boundingBox();
    assert.ok(box && box.x === 0 && box.width === 390 && box.y === 0, 'on a phone the Agent is a full-screen surface');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'no horizontal page scroll');
    await page.screenshot({ path: evidenceDir + '/agent-m1-mobile.png' });
    await page.keyboard.press('Escape');

    // Beranda is launcher-first: the seven business modules from the registry, then "Semua modul" (MS2).
    await page.goto(base + '/');
    const home = page.locator('[data-mobile-home]');
    await home.waitFor();
    await home.locator('[data-module-tile="all"]').waitFor();
    const tiles = await home.locator('[data-module-tile]').evaluateAll((els) => els.map((e) => e.getAttribute('data-module-tile')));
    assert.deepEqual(tiles, ['marketing', 'sales', 'ta', 'hr', 'tm', 'pmo', 'finance', 'all'], 'business modules in registry order, then the full directory');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({ path: evidenceDir + '/ms1-mobile-home.png' });
    // Module landing sheet: real submodules, cross-division ownership shown.
    await home.locator('[data-module-tile="pmo"]').click();
    const landing = page.locator('[data-module-landing="pmo"]');
    await landing.locator('[data-submodule="/pmo/contracts"]').waitFor();
    await landing.getByText('Milik Finance', { exact: true }).waitFor();
    await page.screenshot({ path: evidenceDir + '/ms1-mobile-landing-pmo.png' });
    await landing.locator('[data-submodule="/pmo/contracts"]').click();
    await page.waitForURL('**/pmo/contracts');

    // MS2 PMO journey (doc 18 §16): A.Contract as a card list, not a table.
    await page.locator('[data-module-header="pmo"]').waitFor();
    const list = page.locator('[data-mobile-list]');
    await list.waitFor();
    assert.equal(await page.locator('table:visible').count(), 0, 'no desktop table on a phone');
    assert.equal(await page.locator('[data-mobile-context]').count(), 0, 'a mobile-native page needs no context bar');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await list.locator('[data-list-filter]').click();
    await page.getByRole('dialog', { name: 'Urutkan & filter' }).waitFor();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: evidenceDir + '/ms2-contracts.png' });
    // Full-screen record with grouped sections.
    await list.locator('[data-list-item]').first().click();
    await page.waitForURL(/\/pmo\/contracts\/[0-9a-f-]{36}$/);
    const contractPath = new URL(page.url()).pathname;
    await page.locator('[data-record-header]').waitFor();
    for (const section of ['period', 'commercial', 'billing', 'invoices', 'documents', 'handoff']) await page.locator(`[data-record-section="${section}"]`).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({ path: evidenceDir + '/ms2-contract-record.png' });
    // Contextual Agent from the record: ERP resolves "ini" to this contract; the header shows it.
    await page.locator('[data-sticky-actions] [data-ask-agent]').click();
    await panel.getByLabel('Pesan untuk Agent').waitFor();
    const ctxChip = panel.locator('[data-agent-context]');
    await ctxChip.getByText('PMO › A.Contract', { exact: true }).waitFor();
    assert.equal(await ctxChip.getAttribute('data-agent-entity'), 'project_contract');
    await panel.getByLabel('Pesan untuk Agent').fill('Kontrak ini berakhir kapan?');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    await panel.getByText('Tentang record yang sedang Anda buka', { exact: false }).last().waitFor({ timeout: 30000 });
    // Feedback about this page goes through the existing Masukan governance, carrying the page.
    await panel.getByLabel('Pesan untuk Agent').fill('Tabel ini susah dipakai di HP');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    await panel.getByText('Ini terdengar seperti masukan', { exact: false }).last().waitFor({ timeout: 30000 });
    await panel.getByRole('button', { name: 'Jadikan Feature Request' }).last().click();
    await panel.getByText(`Saya siapkan sebagai Feature Request dari halaman ${contractPath}`, { exact: false }).last().waitFor({ timeout: 30000 });
    const ms2Fr = panel.locator('[data-proposal][data-proposal-state="pending"]').last();
    await page.screenshot({ path: evidenceDir + '/ms2-contract-agent.png' });
    await ms2Fr.getByRole('button', { name: /^Konfirmasi 1 perubahan/ }).click();
    await panel.locator('[data-proposal][data-proposal-state="applied"]').last().getByText(/FR-\d+-\d+ dibuat/).waitFor({ timeout: 30000 });
    await page.keyboard.press('Escape');
    // TM Invoice → PMO hands over to Finance → Finance accepts, all on the phone with the existing actions.
    await page.locator('[data-related-invoice]').first().click();
    await page.waitForURL(/\/pmo\/invoices\/[0-9a-f-]{36}$/);
    await page.locator('[data-record-section="bast"]').waitFor();
    // Earlier journeys may already have handed this PQ over; the phone continues from whatever state ERP holds.
    const handoffState = await page.locator('[data-handoff-state]').getAttribute('data-handoff-state');
    assert.ok(['pending', 'needs_revision', 'notified'].includes(handoffState), 'handoff open for this run: ' + handoffState);
    if (handoffState !== 'notified') {
      await page.locator('[data-action="submit-to-finance"]').click();
      const handoverSheet = page.getByRole('dialog', { name: /Serahkan (ulang )?ke Finance/ });
      await handoverSheet.getByLabel('Tautan dokumen').fill('https://drive.google.com/drive/folders/synthetic-ms2');
      await page.screenshot({ path: evidenceDir + '/ms2-invoice-handover.png' });
      await handoverSheet.getByRole('button', { name: 'Kirim', exact: true }).click();
      await page.locator('[data-handoff-state="notified"]').waitFor({ timeout: 30000 });
    }
    // MS3 Tinjau: a notified handoff is waiting for Finance (the Owner holds Finance), and the tab shows the count.
    const invoicePath = new URL(page.url()).pathname;
    await tabbar.locator('[data-tab-review]').click();
    await page.waitForURL('**/review');
    const queue = page.locator('[data-review-queue]');
    await queue.locator('[data-review-item="finance_verify"]').first().waitFor();
    await tabbar.locator('[data-review-badge]').waitFor();
    for (const kind of ['signature', 'time_off']) await queue.locator(`[data-review-item="${kind}"]`).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({ path: evidenceDir + '/ms3-review-queue.png' });
    await page.goto(base + invoicePath);
    await page.locator('[data-action="finance-verify"]').click();
    await page.getByRole('dialog', { name: 'Verifikasi dokumen' }).getByRole('button', { name: 'Terima' }).click();
    await page.locator('[data-handoff-state="received"]').waitFor({ timeout: 30000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({ path: evidenceDir + '/ms2-invoice-record.png' });
    // Modul directory and Tinjau.
    await tabbar.getByRole('link', { name: 'Modul' }).click();
    await page.locator('[data-module-directory]').getByText('Talent Management', { exact: true }).waitFor();
    await page.screenshot({ path: evidenceDir + '/ms1-mobile-modules.png' });
    await tabbar.getByRole('link', { name: /^Tinjau/ }).click();
    await page.locator('[data-review-queue]').waitFor();
    await page.getByRole('link', { name: 'Lihat semua' }).click();
    await page.locator('[data-review-list]').waitFor();

    // MS3 decisions on the phone, through the existing Time Off and TTD actions.
    await page.goto(base + '/review');
    await queue.locator('[data-review-item="time_off"] a').first().click();
    await page.waitForURL(/\/review\/time-off\/[0-9a-f-]{36}$/);
    await page.locator('[data-record-section="journey"]').waitFor();
    await page.screenshot({ path: evidenceDir + '/ms3-time-off-record.png' });
    await page.locator('[data-action="time-off-approve"]').click();
    await page.getByRole('dialog', { name: 'Setujui Time Off' }).locator('[data-action="time-off-confirm"]').click();
    await page.waitForURL('**/review');
    await queue.waitFor();
    assert.equal(await queue.locator('[data-review-item="time_off"]').count(), 0, 'approved time off leaves the queue');
    await queue.locator('[data-review-item="signature"] a').first().click();
    await page.waitForURL(/\/review\/signature\/[0-9a-f-]{36}$/);
    for (const section of ['proposal', 'journey', 'request']) await page.locator(`[data-record-section="${section}"]`).waitFor();
    await page.getByText('Dimas Synthetic', { exact: true }).first().waitFor();
    await page.locator('[data-journey-step="approval_1"]').getByText('Giliran Anda', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({ path: evidenceDir + '/ms3-extension-record.png', fullPage: true });
    await page.locator('[data-action="signature-reject"]').click();
    const rejectSheet = page.getByRole('dialog', { name: 'Tolak permintaan' });
    await rejectSheet.getByLabel('Alasan (opsional)').fill('Periode belum sesuai PKS');
    await rejectSheet.locator('[data-action="signature-reject-confirm"]').click();
    await page.waitForURL('**/review');
    await queue.waitFor();
    assert.equal(await queue.locator('[data-review-item="signature"]').count(), 0, 'rejected signature leaves the queue');

    // MS3 Beranda search: records the user may read, and the question handed to the Agent.
    await page.goto(base + '/');
    await page.locator('[data-home-search]').click();
    await page.waitForURL('**/search');
    await page.locator('[data-search-input]').fill('Synthetic Browser');
    await page.locator('[data-search-record]').first().waitFor({ timeout: 30000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({ path: evidenceDir + '/ms3-search.png' });
    await page.locator('[data-search-ask]').click();
    await panel.getByText('Synthetic Browser', { exact: false }).first().waitFor({ timeout: 30000 });
    await page.keyboard.press('Escape');

    // MS3 Tangkap: a document from the phone becomes a governed Company File with an explicit kind and class.
    await page.goto(base + '/');
    await page.locator('[data-home-capture]').click();
    const captureSheet = page.getByRole('dialog', { name: 'Tangkap dokumen' });
    await captureSheet.locator('[data-capture-file]').setInputFiles({ name: 'ms3-sop-capture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% MS3 synthetic capture\n') });
    await captureSheet.locator('[data-capture-picked]').waitFor();
    await captureSheet.getByLabel('Judul').fill('SOP capture MS3');
    await captureSheet.locator('select[name="kind"]').waitFor();
    await page.screenshot({ path: evidenceDir + '/ms3-capture.png' });
    await captureSheet.locator('[data-action="capture-save"]').click();
    await captureSheet.locator('[data-capture-saved]').waitFor({ timeout: 30000 });
    await page.keyboard.press('Escape');

    // MS3 Finance: the handoff as a card list with state tabs.
    await page.goto(base + '/finance');
    await page.locator('[data-module-header="finance"]').waitFor();
    await page.locator('[data-mobile-list] [data-list-item]').first().waitFor();
    assert.equal(await page.locator('table:visible').count(), 0, 'no desktop table on a phone');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({ path: evidenceDir + '/ms3-finance-list.png' });
    // PWA: manifest and icons are public, the service worker registers.
    const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
    assert.equal(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('/'))), true, 'service worker registered');
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await page.locator('[data-mobile-tabbar]').isVisible(), false, 'desktop keeps the sidebar layout');
    assert.deepEqual(errors, [], 'no browser runtime exceptions');
    console.log('PASS: Agent browser — one surface (Ringkasan + one composer, no tabs), Tanyakan with typed evidence, keyword search, free-text Masukan → Feature Request confirmed, form fallback, entity context, follow-up and file import confirmed in ERP, keyboard; mobile shell (no sidebar, tab bar, full-screen Agent, launcher Beranda, landing sheet, Modul, Tinjau, PWA manifest + service worker); MS2 PMO (card list + sort sheet, full-screen contract record, contextual Agent with the record, Masukan → Feature Request from the page, TM Invoice → Finance handover accepted); MS3 (Tinjau queue with badge, Finance handoff item, Time Off approved and Extension signature rejected on the phone, Beranda search → records + Tanya Agent, Tangkap → Company File, Finance handoff list); Company Files explorer, upload queued, file found and asked about in the Agent, scanned attachment saved to Company Files');
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
    page.on('pageerror', (e) => errors.push(page.url() + ': ' + e.message));
    await page.goto(base + '/ta');
    await page.getByRole('button', { name: /^Celerates Agent/ }).click();
    const panel = page.getByRole('dialog', { name: 'Celerates Agent' });
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
    // The model understands a correction of company knowledge; the user edits the draft and sends it to curators.
    await panel.locator('[data-agent-attachment]').getByRole('button', { name: 'Lepas berkas' }).click();
    await panel.getByLabel('Pesan untuk Agent').fill('SOP TA PIC sudah berubah, sekarang PIC ditetapkan dalam 2 hari kerja');
    await panel.getByRole('button', { name: 'Kirim' }).click();
    const draft = panel.locator('[data-agent-submission="knowledge_correction"]').last();
    await draft.waitFor({ timeout: 30000 });
    await panel.locator('[data-agent-message]').last().locator('[data-provenance]').waitFor({ timeout: 30000 });
    await draft.getByText('SOP Requisition TA PIC', { exact: false }).waitFor();
    await draft.getByLabel('Judul').fill('SOP TA PIC: 2 hari kerja (browser)');
    await page.screenshot({ path: evidenceDir + '/agent-knowledge-correction.png' });
    await draft.getByRole('button', { name: 'Kirim' }).click();
    await draft.getByText('Terkirim ke kurator', { exact: false }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: Agent browser (model) — push-to-talk transcript reviewed then sent, answer labelled Inferensi, every cited id has an evidence card; dropped PDF → requisition proposal; knowledge correction understood, edited and sent');
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
    page.on('pageerror', (e) => errors.push(page.url() + ': ' + e.message));
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
    // Masukan from the conversation: the sent knowledge correction waits here; a curator makes it a knowledge draft.
    const correction = page.locator('[data-console-submissions] tbody tr').filter({ hasText: 'SOP TA PIC: 2 hari kerja (browser)' });
    await correction.getByRole('button', { name: 'Jadikan draf pengetahuan' }).click();
    await page.locator('[data-console-submission="promoted"]').filter({ hasText: 'SOP TA PIC: 2 hari kerja (browser)' }).waitFor();
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
