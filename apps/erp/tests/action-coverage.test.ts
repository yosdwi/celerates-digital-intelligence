import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
// Accepted first statements: an actor guard (the module authority follows it) or the disabled-integration gate.
const GUARD = /^await (requireActor|requireOwner|requirePendingActor|requireTalentActor|integrationDisabled)\(\);$/;
function walk(dir: string): string[] { return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]); }
test('every server action begins with actor guard or disabled-integration gate', () => {
  let count=0;
  for(const file of walk('src').filter(f=>/\.tsx?$/.test(f))) {
    const source=readFileSync(file,'utf8');
    if(!/^['"]use server['"];/.test(source.trimStart()) || file.endsWith('locale-actions.ts')) continue;
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    for(const node of ast.statements) if(ts.isFunctionDeclaration(node) && node.body && node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) {
      assert.match(node.body.statements[0]?.getText(ast) ?? '', GUARD, file+':'+node.name?.text); count++;
    }
  }
  assert.ok(count >= 240);
});

test('the guard pattern rejects an action without a leading guard', () => {
  for (const first of ['await requirePilotActor();', 'await requireDivisionAccess("sales");', 'const x = 1;', 'await requireActor(); await other();', 'requireActor();', ''])
    assert.doesNotMatch(first, GUARD, first);
  for (const first of ['await requireActor();', 'await requireOwner();', 'await requireTalentActor();', 'await integrationDisabled();'])
    assert.match(first, GUARD, first);
});
