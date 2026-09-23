import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
function walk(dir: string): string[] { return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]); }
test('every server action begins with actor guard or disabled-integration gate', () => {
  let count=0;
  for(const file of walk('src').filter(f=>/\.tsx?$/.test(f))) {
    const source=readFileSync(file,'utf8');
    if(!/^['"]use server['"];/.test(source.trimStart()) || file.endsWith('locale-actions.ts')) continue;
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    for(const node of ast.statements) if(ts.isFunctionDeclaration(node) && node.body && node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) {
      assert.match(node.body.statements[0].getText(ast), /^await (requirePilotActor|integrationDisabled)\(\);$/, file+':'+node.name?.text); count++;
    }
  }
  assert.ok(count >= 240);
});
