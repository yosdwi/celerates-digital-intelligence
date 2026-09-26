#!/usr/bin/env node
/* Read-only, isolated function probes. No real database, network, mail or storage.
 * Run: node probe-snapshot.cjs /absolute/extracted/erp /absolute/node_modules/typescript
 * A passing probe confirms the named observation; it does NOT certify safety.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const [root, typescriptPath] = process.argv.slice(2);
if (!root || !typescriptPath) throw Error('Provide snapshot root and installed TypeScript path');
const ts = require(path.resolve(typescriptPath));
function moduleFrom(relative, mocks, overrides = {}) {
  const filename = path.join(root, relative);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const exports = {};
  const sandbox = { exports, module: { exports }, URL, Date, process: { env: {} },
    require(name) {
      if (!Object.hasOwn(mocks, name)) throw Error(`Unmocked import blocked: ${name}`);
      return mocks[name];
    }, ...overrides };
  vm.runInNewContext(js, sandbox, { filename, timeout: 1000 });
  return exports;
}
const observations = [];
async function probe(id, description, fn) {
  await fn();
  observations.push({ id, description, result: 'observation confirmed' });
}
(async () => {
  const session = { user: { id: 'user-A', status: 'rejected', access: [{ divisionKey: 'sales', level: 'editor' }] } };
  const guard = moduleFrom('src/lib/require-division-access.ts', {
    'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authOptions: {} },
  });
  await probe('AUTH-REJECTED', 'Division guard accepts a rejected session with retained editor access', async () => {
    assert.equal((await guard.requireDivisionAccess('sales')).userId, 'user-A');
  });
  await probe('AUTH-VIEWER-DENIED', 'Existing division guard correctly denies a viewer mutation', async () => {
    session.user.status = 'active'; session.user.access[0].level = 'viewer';
    await assert.rejects(() => guard.requireDivisionAccess('sales'));
  });
  let signedPath;
  const documents = moduleFrom('src/lib/document-actions.ts', {
    './storage': { getDocumentUrl: async p => { signedPath = p; return 'mock-signed-url'; } },
    './storage-url': { extractStoragePathFromSignedUrl: () => null },
  });
  await probe('STORAGE-PATH', 'Document action forwards an arbitrary known object path without requesting an actor or resource authorization', async () => {
    assert.equal(await documents.getDocumentSignedUrl('another-candidate/private.pdf'), 'mock-signed-url');
    assert.equal(signedPath, 'another-candidate/private.pdf');
  });
  let token = null;
  const middleware = moduleFrom('src/middleware.ts', {
    'next/server': { NextResponse: { next: () => ({ kind: 'next' }), redirect: u => ({ kind: 'redirect', url: String(u) }) } },
    'next-auth/jwt': { getToken: async () => token },
    '@/lib/division-map': { DIVISION_PATHS: [], CROSS_DIVISION_PATHS: [] },
  });
  await probe('CRON-REDIRECT', 'Middleware redirects a machine cron request without a session to login', async () => {
    const pathname = '/api/cron/reminders';
    assert.match((await middleware.middleware({ nextUrl: { pathname }, url: `https://erp.invalid${pathname}`, headers: { authorization: 'Bearer mock' } })).url, /\/login$/);
  });
  await probe('FEEDBACK-TALENT', 'Active talent is redirected away from the existing feedback route', async () => {
    token = { status: 'active', accountType: 'talent' };
    assert.match((await middleware.middleware({ nextUrl: { pathname: '/feature-requests' }, url: 'https://erp.invalid/feature-requests' })).url, /\/timesheet$/);
  });
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-09-23T00:00:00Z'])); }
    getDay() { return 3; }
  }
  const reminders = moduleFrom('src/lib/automation/reminder-engine.ts', {
    '@/db': { db: { select: () => ({ from: () => ({ where: async () => [{ id: 'r1', is_active: true, schedule_day_of_week: 3, schedule_time: '23:59' }] }) }) } },
    '@/db/schema': { automationReminders: { is_active: 'is_active' }, automationReminderRecipients: {}, automationReminderLogs: {} },
    'drizzle-orm': { eq: (...args) => args }, './channels': { sendViaChannel: () => { throw Error('Sending is forbidden in audit'); } },
  }, { Date: FixedDate });
  await probe('REMINDER-DUE', 'A 23:59 reminder is due at 00:00 on the same day and remains due on a repeated poll', async () => {
    assert.equal((await reminders.getDueReminders())[0].id, 'r1');
    assert.equal((await reminders.getDueReminders())[0].id, 'r1');
  });
  const writes = [], deleted = [];
  const feedback = moduleFrom('src/app/feature-requests/actions.ts', {
    '@/db': { db: { update: table => ({ set: values => ({ where: async predicate => { writes.push({ table, values, predicate }); } }) }) } },
    '@/db/schema': { featureRequests: { id: 'feature_requests.id' }, users: {} },
    'next/cache': { revalidatePath: () => {} }, 'next/navigation': { redirect: () => {} },
    '@/lib/saved-flag': { markSaved: async () => {} }, 'drizzle-orm': { eq: (field, value) => ({ field, value }) },
    'next-auth': { getServerSession: async () => ({ user: { id: 'user-A', status: 'active', isOwner: false } }) },
    '@/lib/auth': { authOptions: {} }, '@/lib/activity-log': { logActivity: async () => {} },
    '@/lib/notifications': { createNotification: async () => {} },
    '@/lib/attachments': { extractFiles: () => [], extractLinks: () => [], deleteAttachment: async id => deleted.push(id) },
    './constants': { FEATURE_REQUEST_ATTACHMENT_SOURCE: 'feature_request', STATUS_LABELS: {} },
  });
  await probe('FEEDBACK-UPDATE', 'Non-owner update reaches the database for an arbitrary feedback ID without reading requester ownership', async () => {
    await feedback.updateFeatureRequest('request-of-user-B', { get: key => ({ title: 'Audit', description: 'Synthetic data' })[key] ?? null });
    assert.equal(writes[0].predicate.value, 'request-of-user-B');
  });
  await probe('ATTACHMENT-DELETE', 'Feedback delete action forwards an arbitrary attachment ID without checking its parent or actor', async () => {
    await feedback.deleteFeatureRequestAttachment('attachment-of-another-module');
    assert.equal(deleted[0], 'attachment-of-another-module');
  });
  console.log(JSON.stringify({ scope: 'Transpiled original functions, mocked dependencies, no HTTP exploit or live services tested', observations }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
