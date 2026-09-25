import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function contractJourney({base,request,db,tracker,readToken,actionToken}) {
 const root='/api/integration/v1/';
 async function machine(path,options={},token=readToken){return fetch(base+root+path,{...options,headers:{Authorization:'Bearer '+token,'X-ERP-Audience':'celerates-intelligence','X-ERP-Environment':'local-test','Content-Type':'application/json',...options.headers}});}
 async function post(path,body,key,token=actionToken){return machine(path,{method:'POST',body:JSON.stringify(body),headers:{'Idempotency-Key':key}},token);}
 const id=tracker.id;
 assert.equal((await fetch(base+root+'resources/sales_opportunity')).status,401);
 assert.equal((await machine('resources/sales_opportunity',{},actionToken)).status,401);
 assert.equal((await machine('resources/sales_opportunity',{headers:{'X-ERP-Environment':'wrong'}})).status,403);
 assert.equal((await machine('resources/sales_opportunity/'+id)).status,404,'ungranted data hidden');
 const grant=await request('/api/intelligence/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'grant',resource_id:id,enabled:true})});assert.equal(grant.status,200,await grant.text());
 const source=await (await machine('resources/sales_opportunity/'+id)).json();assert.equal(source.data.id,id);assert.equal(source.record_version,1);assert.ok(!('price_amount' in source.data));
 const kinds=['brief','requirements','clarifications','experience','capability','risks','solution','scope','effort','proposal','actions'];
 const manifest={run_id:randomUUID(),context_id:randomUUID(),context_sha256:'a'.repeat(64),workflow_version:'contract-test-v1',outcome:'READY_FOR_SALES',note:'Synthetic explicit review only',artifacts:kinds.map(kind=>({id:kind,kind,title:kind,version:1,content:{summary:'Synthetic reviewed artifact',rows:[]}}))};
 const body={resource_type:'sales_opportunity',resource_id:id,expected_version:source.record_version,manifest};
 assert.equal((await post('review-requests',body,'wrong-scope',readToken)).status,401);
 let response=await post('review-requests',body,'synthetic-review');assert.equal(response.status,200,await response.clone().text());const review=await response.json();
 assert.equal((await post('review-requests',{...body,manifest:{...manifest,note:'changed'}},'synthetic-review')).status,409);
 const command={kind:'artifact.persist_approved_reference',review_id:review.id,resource_type:'sales_opportunity',resource_id:id,expected_version:1,manifest_sha256:review.manifest_sha256};
 assert.equal((await post('commands',command,'synthetic-command')).status,412,'service cannot self-approve');
 assert.equal((await machine('reviews/'+review.id,{method:'POST',body:JSON.stringify({decision:'approved'})},actionToken)).status,401);
 const approve={review_id:review.id,decision:'approved',manifest_sha256:review.manifest_sha256,expected_version:1,note:'Owner inspected eleven exact artifacts'};
 assert.equal((await request('/api/intelligence/reviews',{method:'POST',headers:{Origin:'https://wrong.example','Content-Type':'application/json'},body:JSON.stringify(approve)})).status,403);
 response=await request('/api/intelligence/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(approve)});assert.equal(response.status,200,await response.text());
 const responses=await Promise.all([post('commands',command,'synthetic-command'),post('commands',command,'synthetic-command')]);
 for(const r of responses)assert.equal(r.status,200,await r.clone().text());
 const receipts=await Promise.all(responses.map(r=>r.json()));assert.deepEqual(receipts[0],receipts[1]);
 assert.equal((await db`SELECT count(*)::int n FROM intelligence_artifact_references WHERE resource_id=${id}`)[0].n,1);
 assert.equal((await post('commands',{...command,expected_version:2},'synthetic-command')).status,409);
 assert.equal((await post('commands',command,'another-command-key')).status,412,'consumed approval cannot apply another action');
 assert.deepEqual(await (await machine('commands/'+receipts[0].command_id)).json(),receipts[0]);
 const events=await (await machine('events?cursor=0')).json();assert.ok(events.items.some(e=>e.event_type==='artifact.reference.attached.v1'));
 assert.ok((await (await machine('resources/sales_opportunity/'+id)).json()).data.artifact_references.some(r=>r.id===receipts[0].reference_id));
 // A source mutation after proposal invalidates review; no stale business write.
 const next={...body,expected_version:2,manifest:{...manifest,run_id:randomUUID()}};
 const stale=await (await post('review-requests',next,'stale-review')).json();
 await db`UPDATE sales_opportunity_trackers SET requirement_summary='Changed requirement' WHERE id=${id}`;
 assert.equal((await request('/api/intelligence/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...approve,review_id:stale.id,manifest_sha256:stale.manifest_sha256,expected_version:2})})).status,412);
 await request('/api/intelligence/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'grant',resource_id:id,enabled:false})});
 assert.equal((await machine('resources/sales_opportunity/'+id)).status,404);
 assert.equal((await post('commands',command,'synthetic-command')).status,404,'revocation prevents even receipt replay disclosure');
 // Restore this synthetic fixture for the Python cross-stack journey.
 await request('/api/intelligence/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'grant',resource_id:id,enabled:true})});
 console.log('PASS: live machine scopes, explicit grants, exact human approval, concurrent idempotency, receipt read-back, outbox, stale source and revocation');
}
