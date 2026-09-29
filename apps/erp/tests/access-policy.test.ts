import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertActor, assertOwner, safeContextPath, safeExternalLink } from '../src/lib/access-policy';
import { canOpenRoute } from '../src/lib/route-access';
import { resolveModules } from '../src/lib/module-access';
test('only active backoffice users pass the actor guard; Talent accounts never do', () => {
  for (const actor of [null, {}, {id:'u',status:'pending'}, {id:'u',status:'rejected'}, {id:'u',status:'inactive',isOwner:true}, {id:'u',status:'active',accountType:'talent'}, {status:'active'}]) assert.throws(() => assertActor(actor));
  assert.equal(assertActor({id:'u',status:'active'}).id,'u');
  assert.equal(assertActor({id:'u',status:'active',accountType:'backoffice',access:[{divisionKey:'sales',level:'viewer'}]}).id,'u');
  assert.equal(assertActor({id:'o',status:'active',isOwner:true}).id,'o');
});
test('Owner-only guard', () => {
  for (const actor of [null, {id:'u',status:'active'}, {id:'u',status:'active',access:[{divisionKey:'pmo',level:'full'}]}, {id:'o',status:'pending',isOwner:true}]) assert.throws(() => assertOwner(actor));
  assert.equal(assertOwner({id:'o',status:'active',isOwner:true}).id,'o');
});
test('route gate follows the division RBAC', () => {
  const sales = { access: [{ divisionKey: 'sales', level: 'viewer' }] };
  const pmoEditor = { access: [{ divisionKey: 'pmo', level: 'editor' }] };
  const pmoFull = { access: [{ divisionKey: 'pmo', level: 'full' }] };
  assert.ok(canOpenRoute(sales, '/sales/opportunity-tracker'));
  assert.ok(canOpenRoute(sales, '/ta/client-active'));
  assert.ok(canOpenRoute(sales, '/pmo/overtime-business-trip'));
  assert.ok(!canOpenRoute(sales, '/pmo/readiness'));
  assert.ok(!canOpenRoute(sales, '/hr'));
  assert.ok(canOpenRoute(sales, '/tasks'));
  assert.ok(canOpenRoute(sales, '/review'));
  assert.ok(canOpenRoute(sales, '/'));
  assert.ok(!canOpenRoute(sales, '/executive-dashboard'));
  assert.ok(canOpenRoute(pmoEditor, '/finance'));
  assert.ok(!canOpenRoute(pmoEditor, '/timesheet'));
  assert.ok(canOpenRoute(pmoFull, '/timesheet/converter'));
  assert.ok(!canOpenRoute(pmoFull, '/executive-dashboard'));
  assert.ok(canOpenRoute({ isOwner: true }, '/executive-dashboard'));
  assert.ok(canOpenRoute({ isOwner: true }, '/hr/attendance-settings'));
  assert.ok(!canOpenRoute({ accountType: 'talent', access: [{ divisionKey: 'sales', level: 'full' }] }, '/sales'));
});
test('feedback drops query/fragment; unsafe links are rejected', () => {
  assert.equal(safeContextPath('/sales?token=secret#x'), '/sales');
  assert.equal(safeContextPath('//outside.test'), '/');
  for(const value of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:password@host.test']) assert.throws(() => safeExternalLink(value));
  assert.equal(safeExternalLink('https://github.com/yosdwi/celerates-digital-intelligence/issues/3'), 'https://github.com/yosdwi/celerates-digital-intelligence/issues/3');
});
test('route gate agrees with module-access: every route of a module the user can open is reachable', () => {
  const divisions = ['marketing', 'sales', 'ta', 'hr', 'tm', 'pmo', 'finance', 'school', 'automation'];
  const profiles = [
    ...divisions.map((d) => ({ accountType: 'backoffice', access: [{ divisionKey: d, level: 'viewer' }] })),
    { accountType: 'backoffice', access: [{ divisionKey: 'pmo', level: 'full' }] },
    { accountType: 'backoffice', access: [] },
    { isOwner: true, accountType: 'backoffice', access: [] },
  ];
  for (const claims of profiles) {
    const modules = resolveModules(claims);
    const shared = new Set(modules.filter((m) => m.access !== 'none').flatMap((m) => m.subPages.map((s) => s.href)));
    for (const m of modules) {
      const own = m.access !== 'none';
      // A module's base path is reachable exactly when the module is open to the user (or shared with one that is).
      assert.equal(canOpenRoute(claims, m.config.basePath), own || shared.has(m.config.basePath), `${JSON.stringify(claims.access)} ${m.config.basePath}`);
      if (own) for (const sub of m.subPages) assert.ok(canOpenRoute(claims, sub.href), `${JSON.stringify(claims.access)} ${sub.href}`);
    }
  }
});
