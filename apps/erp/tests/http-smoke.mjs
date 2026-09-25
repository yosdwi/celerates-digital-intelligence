// Disposable local integration harness: real Next production HTTP + PG wire/S3 emulators.
// No production URL or credentials are accepted by this script.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import S3rver from 's3rver';
import postgres from 'postgres';
import { migrate } from '../scripts/migrate.mjs';
const require = createRequire(import.meta.url);
const { encodeReply } = require('next/dist/compiled/react-server-dom-webpack/client.node');
const base='http://127.0.0.1:3310';
const dir=await mkdtemp(tmpdir()+'/erp-http-');
Object.assign(process.env,{ DATABASE_URL:'postgres://postgres:postgres@127.0.0.1:55440/postgres', DB_POOL_MAX:'1', NEXTAUTH_URL:base, NEXTAUTH_SECRET:randomBytes(32).toString('hex'), PII_ENCRYPTION_KEY:randomBytes(32).toString('hex'), SETUP_TOKEN:randomBytes(32).toString('hex'), S3_ENDPOINT:'http://127.0.0.1:59000', S3_ACCESS_KEY_ID:'S3RVER', S3_SECRET_ACCESS_KEY:'S3RVER', S3_BUCKET_PREFIX:'erp-test', APP_ENV:'local-test',RELEASE_SHA:'http-smoke',NEXT_TELEMETRY_DISABLED:'1' });
const pg=spawn(process.execPath,['node_modules/@electric-sql/pglite-socket/dist/scripts/server.js','-p','55440','-m','10'],{stdio:['ignore','ignore','pipe']});
pg.stderr.on('data',d=>process.stderr.write(d));
const s3=new S3rver({ port:59000,address:'127.0.0.1',silent:true,directory:dir });
const sql=postgres(process.env.DATABASE_URL,{max:1,prepare:false,connect_timeout:2});
let app;
async function until(fn,label) { for(let i=0;i<80;i++){try { if(await fn()) return; }catch{} await new Promise(r=>setTimeout(r,250));}throw new Error('Timeout: '+label); }
try {
 await s3.run();
 await until(async()=>{await sql`SELECT 1`;return true;},'PG startup');
 await sql.end(); // migration runner owns its connection
 await migrate();
 const { initStorage }=await import('../scripts/init-storage.mjs');await initStorage();
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','-p','3310'],{env:process.env,stdio:['ignore','ignore','pipe']});
 let errors='';app.stderr.on('data',d=>{errors+=d.toString();});
 await until(async()=> (await fetch(base+'/api/health/ready')).ok,'Next readiness');
 const db=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
 try {
  const manifest=JSON.parse(await readFile('.next/server/server-reference-manifest.json','utf8')).node;
  function actionId(name,file) {const found=Object.entries(manifest).find(([,v])=>v.exportedName===name&&v.filename===file);assert.ok(found,'missing action '+name);return found[0];}
  const jar=new Map();
  async function request(path,init={}){const res=await fetch(base+path,{...init,signal:AbortSignal.timeout(30000),redirect:'manual',headers:{Origin:base,...(jar.size?{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}:{}),...init.headers}});for(const line of res.headers.getSetCookie()){const first=line.split(';')[0];const at=first.indexOf('=');jar.set(first.slice(0,at),first.slice(at+1));}return res;}
  async function action(path,file,name,args){const body=await encodeReply(args);const res=await request(path,{method:'POST',headers:{'Next-Action':actionId(name,file)},body});const text=await res.text();assert.ok(res.status<500,`${name}: HTTP ${res.status}; ${errors.slice(-1200)}`);return {res,text};}
  function form(values){const f=new FormData();for(const [k,v]of Object.entries(values))f.set(k,String(v));return f;}
  assert.equal((await fetch(base+'/marketing',{redirect:'manual'})).status,307);
  assert.equal((await fetch(base+'/api/documents?bucket=candidate-documents&path=x')).status,403);
  const token=process.env.SETUP_TOKEN;
  let res=await request('/api/setup',{method:'POST',body:form({token,email:'owner@example.test',name:'Synthetic Pilot Reviewer',password:'Synthetic-Only-Password-123'})});assert.equal(res.status,303,'bootstrap');
  res=await request('/api/setup',{method:'POST',body:form({token,email:'second@example.test',name:'Second',password:'Synthetic-Only-Password-123'})});assert.equal(res.status,400,'one-time setup');
  const csrf=await (await request('/api/auth/csrf')).json();
  res=await request('/api/auth/callback/credentials',{method:'POST',body:new URLSearchParams({csrfToken:csrf.csrfToken,email:'owner@example.test',password:'Synthetic-Only-Password-123',callbackUrl:base,json:'true'})});assert.equal(res.status,200,'login');
  assert.equal((await request('/marketing')).status,200,'authorized page: '+errors.slice(-3000));
  console.log('PASS: bootstrap and authenticated page');
  await action('/marketing','app/marketing/actions.ts','createLead',[form({client_name:'Synthetic Client',contact_name:'Reviewer',service_type_code:'outsourcing',lead_source_code:'inbound',category_code:'new',sales_pic_name:'Owner',is_qualified:'true',project_name:'Synthetic ERP journey',position_name:'Engineer',headcount_target:2,level_code:'senior',price_amount:20000000,price_period_code:'monthly',estimated_duration_months:6})]);
  console.log('Lead create request complete');
  let contextRes=await request('/api/operations/context?path=/marketing%3Ftoken%3Dsecret');
  assert.equal(contextRes.status,200);assert.match(contextRes.headers.get('cache-control'),/no-store/);
  let context=await contextRes.json();assert.equal(context.context.path,'/marketing');
  assert.equal(context.groups.find(g=>g.key==='qualified-leads').count,1);
  assert.doesNotMatch(JSON.stringify(context),/Synthetic Client|price_amount|contact_email|20000000/);

  const [lead]=await db`SELECT * FROM leads WHERE client_name='Synthetic Client'`;assert.ok(lead,'lead saved');
  await action('/marketing','app/marketing/actions.ts','convertLeadToOpportunity',[lead.id]);
  await action('/marketing','app/marketing/actions.ts','convertLeadToOpportunity',[lead.id]);
  console.log('Lead conversion requests complete');
  const trackers=await db`SELECT * FROM sales_opportunity_trackers WHERE lead_id=${lead.id}`;assert.equal(trackers.length,1,'retry does not duplicate tracker');
  const tracker=trackers[0];assert.equal(tracker.position_name,'Engineer');assert.equal(tracker.headcount_target,2);assert.equal(tracker.price_amount,20000000);assert.equal(tracker.price_period_code,'monthly');
  await action('/sales/opportunity-tracker','app/sales/opportunity-tracker/actions.ts','convertToRequisition',[tracker.id,form({})]);
  console.log('Requisition conversion request complete');
  const [req]=await db`SELECT * FROM requisitions WHERE opportunity_id=${tracker.id}`;assert.ok(req,'requisition created');assert.equal(req.headcount_target,2);
  const [opty]=await db`SELECT * FROM opportunities WHERE opportunity_tracker_id=${tracker.id}`;assert.equal(opty.opty_no,tracker.opty_no,'shared business key');
  context=await (await request('/api/operations/context?path=/sales')).json();
  assert.equal(context.groups.find(g=>g.key==='unassigned-requisitions').count,1);
  assert.equal(context.groups.find(g=>g.key==='qualified-trackers').count,0);
  const [contract]=await db`INSERT INTO project_contracts(opportunity_id) VALUES (${opty.id}) RETURNING id`;
  await db`INSERT INTO project_monthly_billings(contract_id,month,amount) VALUES (${contract.id},'2025-01-01',20000000)`;
  for(const page of ['/pmo','/pmo/invoices']) assert.equal((await request(page)).status,200,'PMO page renders');
  assert.equal((await db`SELECT count(*)::int n FROM project_invoices`)[0].n,0,'GET cannot create invoice');
  assert.equal((await db`SELECT count(*)::int n FROM project_documents`)[0].n,0,'GET cannot create document tracker');
  context=await (await request('/api/operations/context?path=/pmo/invoices')).json();
  assert.equal(context.groups.find(g=>g.key==='missing-invoices').count,1);
  assert.equal(context.groups.find(g=>g.key==='missing-documents').count,1);
  for(let i=0;i<2;i++) {
    await action('/pmo/invoices','app/pmo/actions.ts','syncBillingScheduleToInvoices',[]);
    await action('/pmo','app/pmo/actions.ts','syncDocumentTrackerFromContracts',[]);
  }
  assert.equal((await db`SELECT count(*)::int n FROM project_invoices`)[0].n,1,'explicit retry creates one invoice');
  assert.equal((await db`SELECT count(*)::int n FROM project_documents`)[0].n,1,'explicit retry creates one document');
  await request('/pmo/invoices');
  assert.equal((await db`SELECT status_code FROM project_invoices`)[0].status_code,'planned','GET cannot persist overdue');
  context=await (await request('/api/operations/context?path=/pmo/invoices')).json();
  assert.equal(context.groups.find(g=>g.key==='invoice-submission').count,1,'derived submission attention');
  assert.equal(context.groups.find(g=>g.key==='missing-invoices').count,0);
  for (const page of ['/finance','/pmo/dashboard','/executive-dashboard']) assert.equal((await request(page)).status,200,'derived invoice projection renders '+page);
  console.log('PASS: contextual API, read-only PMO pages, explicit repeatable preparation, live derived submission rule');
  if(process.env.ERP_BROWSER_TEST==='1') {
    const { runBrowserJourney }=await import('./browser-journey.mjs');
    await runBrowserJourney({base,cookies:[...jar]});
    const [floating]=await db`SELECT * FROM feature_requests WHERE title='Synthetic floating feedback'`;
    assert.ok(floating);assert.match(floating.context_path,/^\/pmo\/invoices\/[0-9a-f-]+\/edit$/);
    assert.equal(floating.release_sha,'http-smoke');assert.equal(floating.module_area_code,'pmo');
    assert.equal((await db`SELECT count(*)::int n FROM notifications WHERE title='Feature Request Baru'`)[0].n,1);
  }
  const feedback=form({title:'Synthetic BA acceptance',description:'Verify carry-forward',context_path:'/sales?token=must-not-persist',expected_behavior:'Keep staffing fields'});feedback.set('attachments',new File(['%PDF-1.4 synthetic'],'evidence.pdf',{type:'application/pdf'}));
  await action('/feature-requests','app/feature-requests/actions.ts','createFeatureRequest',[feedback]);
  const [item]=await db`SELECT * FROM feature_requests WHERE title='Synthetic BA acceptance'`;assert.equal(item.context_path,'/sales');assert.equal(item.release_sha,'http-smoke');
  const [attachment]=await db`SELECT * FROM attachments WHERE source_id=${item.id}`;assert.ok(attachment,'attachment saved');
  const object=await request('/api/documents?bucket=candidate-documents&path='+encodeURIComponent(attachment.file_path));assert.equal(object.status,200,'private S3 download');assert.equal(await object.text(),'%PDF-1.4 synthetic');
  await action('/feature-requests','app/feature-requests/actions.ts','updateFeatureRequestStatus',[item.id,form({status_code:'done'})]);
  assert.equal((await db`SELECT status_code FROM feature_requests WHERE id=${item.id}`)[0].status_code,'new','premature Done rejected');
  await action('/feature-requests','app/feature-requests/actions.ts','updateFeatureRequestStatus',[item.id,form({status_code:'done',acceptance_criteria:'All fields carry forward',delivered_release:'http-smoke',validation_notes:'Synthetic journey passed',backlog_url:'https://github.com/yosdwi/celerates-digital-intelligence/issues/3'})]);
  assert.equal((await db`SELECT status_code FROM feature_requests WHERE id=${item.id}`)[0].status_code,'done');
  await db`UPDATE users SET status='rejected' WHERE email='owner@example.test'`;
  assert.equal((await request('/api/operations/context?path=/finance')).status,403,'revoked session cannot read operational context');
  const before=(await db`SELECT count(*)::int AS n FROM leads`)[0].n;
  const body=await encodeReply([form({client_name:'MUST NOT WRITE'})]);
  await request('/marketing',{method:'POST',headers:{'Next-Action':actionId('createLead','app/marketing/actions.ts')},body});
  assert.equal((await db`SELECT count(*)::int AS n FROM leads`)[0].n,before,'revoked stale JWT cannot mutate');
  console.log('PASS: bootstrap, login, guarded pages, lead→opportunity→requisition, retry, mapping, contextual feedback, private attachment, BA completion gate, revoked session');
 } finally { await db.end(); }
} finally { app?.kill();pg.kill();await s3.close();await rm(dir,{recursive:true,force:true}); }
