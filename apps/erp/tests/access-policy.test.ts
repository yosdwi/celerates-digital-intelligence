import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPilotActor, safeContextPath, safeExternalLink } from '../src/lib/access-policy';
test('missing, pending, rejected and non-owner actors cannot enter pilot', () => {
  for (const actor of [null, {}, {id:'u',isOwner:true,status:'pending'}, {id:'u',isOwner:true,status:'rejected'}, {id:'u',isOwner:false,status:'active'}]) assert.throws(() => assertPilotActor(actor));
  assert.equal(assertPilotActor({id:'u',isOwner:true,status:'active'}).id,'u');
});
test('feedback drops query/fragment; unsafe links are rejected', () => {
  assert.equal(safeContextPath('/sales?token=secret#x'), '/sales');
  assert.equal(safeContextPath('//outside.test'), '/');
  for(const value of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:password@host.test']) assert.throws(() => safeExternalLink(value));
  assert.equal(safeExternalLink('https://github.com/yosdwi/celerates-digital-intelligence/issues/3'), 'https://github.com/yosdwi/celerates-digital-intelligence/issues/3');
});
