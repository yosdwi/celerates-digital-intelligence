import { createHash, timingSafeEqual } from 'node:crypto';
export class ContractError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export function fail(status: number, code: string, message: string): never { throw new ContractError(status,code,message); }
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
}
export const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export function authenticateMachine(headers: Headers, scope: 'read'|'action') {
  const configured = process.env[scope==='read' ? 'INTELLIGENCE_READ_TOKEN_SHA256' : 'INTELLIGENCE_ACTION_TOKEN_SHA256'];
  const token = headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,200})$/)?.[1];
  if (!configured || !/^[a-f0-9]{64}$/.test(configured) || !token) fail(401,'UNAUTHORIZED','Valid service credential required.');
  const actual=createHash('sha256').update(token).digest();
  if (!timingSafeEqual(actual,Buffer.from(configured,'hex'))) fail(401,'UNAUTHORIZED','Valid service credential required.');
  if (headers.get('x-erp-audience')!=='celerates-intelligence' || headers.get('x-erp-environment')!==(process.env.APP_ENV||'erp-pilot')) fail(403,'AUDIENCE','Service audience/environment mismatch.');
  return 'intelligence-pilot';
}
export function object(value: unknown, keys: string[]): Record<string,unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k))) fail(422,'SCHEMA','Unexpected payload fields.');
  return value as Record<string,unknown>;
}
export function text(value: unknown, max=200): string { if(typeof value!=='string'||!value.trim()||value.length>max) fail(422,'SCHEMA','Invalid text field.');return value; }
export function uuid(value: unknown) { const id=text(value,36);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) fail(422,'SCHEMA','Invalid resource ID.');return id; }
export function positiveInt(value: unknown) { if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1) fail(422,'SCHEMA','Invalid source version.');return value; }
export function manifest(value: unknown) {
  const m=object(value,['run_id','outcome','note','artifacts','context_id','context_sha256','workflow_version']);
  uuid(m.run_id);uuid(m.context_id);text(m.note,2000);text(m.workflow_version,100);
  if(!['READY_FOR_SALES','CLARIFICATION_REQUIRED'].includes(String(m.outcome))) fail(422,'SCHEMA','Unsupported reviewed outcome.');
  if(!/^[a-f0-9]{64}$/.test(String(m.context_sha256))) fail(422,'SCHEMA','Invalid context digest.');
  const kinds=['brief','requirements','clarifications','experience','capability','risks','solution','scope','effort','proposal','actions'];
  if(!Array.isArray(m.artifacts)||m.artifacts.length!==11) fail(422,'SCHEMA','Exactly eleven reviewed artifacts required.');
  const seen=new Set();
  for(const input of m.artifacts) {
    const a=object(input,['id','kind','title','version','content']);text(a.id,100);text(a.title,200);positiveInt(a.version);
    if(!kinds.includes(String(a.kind))||seen.has(a.kind)) fail(422,'SCHEMA','Invalid artifact kind.');seen.add(a.kind);
    const c=object(a.content,['summary','rows']);if(typeof c.summary!=='string'||c.summary.length>20000||!Array.isArray(c.rows)||c.rows.length>200)fail(422,'SCHEMA','Invalid artifact content.');
    for(const row of c.rows){if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length>15||Object.entries(row).some(([k,v])=>k.length>100||typeof v!=='string'||v.length>10000))fail(422,'SCHEMA','Invalid artifact row.');}
  }
  return m;
}
