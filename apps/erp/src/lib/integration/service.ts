import type { Sql, TransactionSql } from 'postgres';
import { randomUUID } from 'node:crypto';
import { digest, fail, manifest, object, positiveInt, text, uuid } from './contract';
type DB=Sql|TransactionSql;
async function granted(db: DB, id: string) {
  const [grant]=await db`SELECT g.resource_id FROM intelligence_record_grants g JOIN users u ON u.id=g.granted_by WHERE g.resource_id=${id} AND g.enabled AND u.status='active' AND u.is_owner FOR SHARE OF g,u`;
  if(!grant)fail(404,'NOT_FOUND','Resource not available to this service.');
}
export async function readResource(db: DB, id: string) {
  await granted(db,id);
  const [row]=await db`SELECT id,opty_no,client_name,requirement_summary,detail_requirement,position_name,headcount_target,sales_qualified,opty_status_code,sales_pic_name,intelligence_version FROM sales_opportunity_trackers WHERE id=${id}`;
  if(!row)fail(404,'NOT_FOUND','Resource not available to this service.');
  const refs=await db`SELECT id,run_id,manifest_sha256,manifest->>'outcome' AS outcome,created_at FROM intelligence_artifact_references WHERE resource_id=${id} ORDER BY created_at DESC LIMIT 10`;
  const {intelligence_version,...data}=row;
  return {schema_version:'1.0',resource_type:'sales_opportunity',record_version:Number(intelligence_version),as_of:new Date().toISOString(),source_refs:[{type:'sales_opportunity',id}],quality:{state:'verified_projection',unknown:['canonical_customer_id','capacity','commercial_approval']},data:{...data,artifact_references:refs}};
}
export async function listResources(db: Sql, cursor: string|undefined, limit: number) {
  const rows=await db`SELECT s.id FROM sales_opportunity_trackers s JOIN intelligence_record_grants g ON g.resource_id=s.id JOIN users u ON u.id=g.granted_by WHERE g.enabled AND u.is_owner AND u.status='active' AND (${cursor??null}::uuid IS NULL OR s.id>${cursor??null}::uuid) ORDER BY s.id LIMIT ${limit+1}`;
  const items=[];for(const row of rows.slice(0,limit))items.push(await readResource(db,row.id));
  return {items,next_cursor:rows.length>limit?rows[limit-1].id:null};
}
export async function proposeReview(db: Sql, principal: string, key: string, input: unknown) {
  const body=object(input,['resource_type','resource_id','expected_version','manifest']);
  if(body.resource_type!=='sales_opportunity')fail(422,'SCHEMA','Only sales_opportunity is supported.');
  const id=uuid(body.resource_id),version=positiveInt(body.expected_version),m=manifest(body.manifest),hash=digest(body);
  return db.begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${principal+':review:'+key},0))`;
    await granted(tx,id);
    const [prior]=await tx`SELECT id,request_hash,state,expires_at,manifest_sha256 FROM intelligence_reviews WHERE principal=${principal} AND request_key=${key}`;
    if(prior){if(prior.request_hash!==hash)fail(409,'IDEMPOTENCY_CONFLICT','Request key was used with different content.');return prior;}
    const [source]=await tx`SELECT intelligence_version FROM sales_opportunity_trackers WHERE id=${id} FOR UPDATE`;
    if(!source||Number(source.intelligence_version)!==version)fail(412,'SOURCE_CHANGED','ERP source changed; build and review fresh context.');
    const [review]=await tx`INSERT INTO intelligence_reviews(principal,request_key,request_hash,resource_id,source_version,manifest,manifest_sha256) VALUES (${principal},${key},${hash},${id},${version},${JSON.stringify(m)}::jsonb,${digest(m)}) RETURNING id,state,expires_at,manifest_sha256`;
    return review;
  });
}
export async function applyCommand(db: Sql, principal: string, key: string, input: unknown) {
  const body=object(input,['kind','review_id','resource_type','resource_id','expected_version','manifest_sha256']);
  if(body.kind!=='artifact.persist_approved_reference'||body.resource_type!=='sales_opportunity')fail(422,'SCHEMA','Unsupported command.');
  const id=uuid(body.resource_id),reviewId=uuid(body.review_id),version=positiveInt(body.expected_version),hash=digest(body);
  text(body.manifest_sha256,64);
  return db.begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${principal+':command:'+key},0))`;
    await granted(tx,id);
    const [previous]=await tx`SELECT request_hash,receipt FROM intelligence_commands WHERE principal=${principal} AND idempotency_key=${key}`;
    if(previous){if(previous.request_hash!==hash)fail(409,'IDEMPOTENCY_CONFLICT','Key was used with a different command.');return previous.receipt;}
    const [review]=await tx`SELECT * FROM intelligence_reviews WHERE id=${reviewId} AND principal=${principal} FOR UPDATE`;
    if(!review||review.resource_id!==id||Number(review.source_version)!==version||review.manifest_sha256!==body.manifest_sha256)fail(412,'APPROVAL_REQUIRED','Matching ERP human approval required.');
    if(review.state!=='approved'||new Date(review.expires_at)<=new Date())fail(412,'APPROVAL_REQUIRED','Approval is not active or has expired.');
    const [human]=await tx`SELECT id FROM users WHERE id=${review.reviewed_by} AND is_owner AND status='active' FOR SHARE`;
    if(!human)fail(412,'APPROVER_REVOKED','Approver is no longer authorized.');
    const [source]=await tx`SELECT intelligence_version FROM sales_opportunity_trackers WHERE id=${id} FOR UPDATE`;
    if(!source||Number(source.intelligence_version)!==version)fail(412,'SOURCE_CHANGED','ERP source changed; rebuild and review.');
    const [already]=await tx`SELECT id FROM intelligence_artifact_references WHERE resource_id=${id} AND run_id=${review.manifest.run_id}`;
    if(already)fail(409,'ALREADY_ATTACHED','This run already has an attached reference.');
    const commandId=randomUUID(),referenceId=randomUUID();
    await tx`INSERT INTO intelligence_artifact_references(id,resource_id,review_id,command_id,run_id,manifest_sha256,manifest) VALUES (${referenceId},${id},${reviewId},${commandId},${review.manifest.run_id},${review.manifest_sha256},${JSON.stringify(review.manifest)}::jsonb)`;
    const [updated]=await tx`UPDATE sales_opportunity_trackers SET intelligence_version=intelligence_version WHERE id=${id} RETURNING intelligence_version`;
    const receipt={schema_version:'1.0',command_id:commandId,state:'applied',acknowledged:true,resource_type:'sales_opportunity',resource_id:id,record_version:Number(updated.intelligence_version),reference_id:referenceId,manifest_sha256:review.manifest_sha256,review_id:reviewId,applied_at:new Date().toISOString()};
    await tx`INSERT INTO intelligence_commands(id,principal,idempotency_key,request_hash,review_id,resource_id,receipt) VALUES (${commandId},${principal},${key},${hash},${reviewId},${id},${JSON.stringify(receipt)}::jsonb)`;
    await tx`UPDATE intelligence_reviews SET state='consumed' WHERE id=${reviewId}`;
    await tx`INSERT INTO activity_logs(division_key,action_type,entity_label,page_label,actor_user_id,actor_name) VALUES ('sales','create',${'Reviewed Intelligence reference '+referenceId},'Intelligence Review',${review.reviewed_by},${principal+' (ERP human approval recorded)'})`;
    await tx`INSERT INTO intelligence_outbox(event_type,resource_id,resource_version,data) VALUES ('artifact.reference.attached.v1',${id},${updated.intelligence_version},${JSON.stringify({command_id:commandId,reference_id:referenceId})}::jsonb)`;
    return receipt;
  });
}
export async function reviewByOwner(db: Sql, humanId: string, input: unknown) {
  const body=object(input,['review_id','decision','manifest_sha256','expected_version','note']);
  const id=uuid(body.review_id), version=positiveInt(body.expected_version),note=text(body.note,2000);
  if(!['approved','rejected'].includes(String(body.decision)))fail(422,'SCHEMA','Approve or reject explicitly.');
  return db.begin(async tx=>{
    const [human]=await tx`SELECT id FROM users WHERE id=${humanId} AND is_owner AND status='active' FOR SHARE`;
    if(!human)fail(403,'FORBIDDEN','Active Owner required.');
    const [review]=await tx`SELECT * FROM intelligence_reviews WHERE id=${id} FOR UPDATE`;
    if(!review||review.state!=='pending'||review.manifest_sha256!==body.manifest_sha256||Number(review.source_version)!==version||new Date(review.expires_at)<=new Date())fail(412,'REVIEW_CHANGED','Review is not current.');
    await granted(tx,review.resource_id);
    const [source]=await tx`SELECT intelligence_version FROM sales_opportunity_trackers WHERE id=${review.resource_id} FOR SHARE`;
    if(!source||Number(source.intelligence_version)!==version)fail(412,'SOURCE_CHANGED','ERP source changed; request fresh analysis.');
    await tx`UPDATE intelligence_reviews SET state=${String(body.decision)},reviewed_by=${humanId},reviewed_at=now(),review_note=${note} WHERE id=${id}`;
    await tx`INSERT INTO activity_logs(division_key,action_type,entity_label,page_label,actor_user_id,actor_name) VALUES ('sales','update',${'Intelligence review '+id+' '+body.decision},'Intelligence Review',${humanId},'ERP Owner')`;
    return {id,state:body.decision};
  });
}
export async function readEvents(db: Sql, cursor: number, limit: number) {
  const rows=await db`SELECT e.* FROM intelligence_outbox e JOIN intelligence_record_grants g ON g.resource_id=e.resource_id JOIN users u ON u.id=g.granted_by WHERE e.sequence>${cursor} AND g.enabled AND u.is_owner AND u.status='active' ORDER BY e.sequence LIMIT ${limit}`;
  return {schema_version:'1.0',items:rows.map(r=>({...r,sequence:Number(r.sequence),resource_version:Number(r.resource_version)})),next_cursor:rows.length?Number(rows[rows.length-1].sequence):cursor};
}
