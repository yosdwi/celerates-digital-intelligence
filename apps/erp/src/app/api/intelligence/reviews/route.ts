import { NextRequest, NextResponse } from 'next/server';
import { requirePilotActor } from '@/lib/actor';
import { sql } from '@/db';
import { ContractError, fail, object, uuid } from '@/lib/integration/contract';
import { reviewByOwner } from '@/lib/integration/service';
export const dynamic='force-dynamic';
async function handle(req: NextRequest) {
  const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
  try {
    let actor;try{actor=await requirePilotActor();}catch{fail(403,'FORBIDDEN','Akses hanya untuk Owner aktif.');}
    const [human]=await sql`SELECT id FROM users WHERE id=${actor.id} AND is_owner AND status='active'`;
    if(!human)fail(403,'FORBIDDEN','Akses tidak tersedia.');
    if(req.method==='GET') {
      const opportunities=await sql`SELECT s.id,s.opty_no,s.client_name,s.intelligence_version,coalesce(g.enabled,false) AS enabled FROM sales_opportunity_trackers s LEFT JOIN intelligence_record_grants g ON g.resource_id=s.id ORDER BY s.created_at DESC LIMIT 200`;
      const reviews=await sql`SELECT r.*,s.opty_no,s.client_name FROM intelligence_reviews r JOIN sales_opportunity_trackers s ON s.id=r.resource_id ORDER BY r.created_at DESC LIMIT 50`;
      return NextResponse.json({opportunities,reviews},{headers});
    }
    const origin=process.env.NEXTAUTH_URL?new URL(process.env.NEXTAUTH_URL).origin:req.nextUrl.origin;
    if(req.headers.get('origin')!==origin)fail(403,'ORIGIN','Origin tidak sesuai.');
    const raw=await req.text();if(raw.length>10000)fail(413,'SIZE','Payload terlalu besar.');
    let input;try{input=JSON.parse(raw);}catch{fail(422,'SCHEMA','JSON tidak valid.');}
    if(input.action==='grant') {
      const b=object(input,['action','resource_id','enabled']);const id=uuid(b.resource_id);
      if(typeof b.enabled!=='boolean')fail(422,'SCHEMA','Status akses tidak valid.');
      await sql.begin(async tx=>{
        const [owner]=await tx`SELECT id FROM users WHERE id=${actor.id} AND is_owner AND status='active' FOR SHARE`;
        if(!owner)fail(403,'FORBIDDEN','Akses tidak tersedia.');
        const [source]=await tx`SELECT id FROM sales_opportunity_trackers WHERE id=${id}`;if(!source)fail(404,'NOT_FOUND','Opportunity tidak ditemukan.');
        await tx`INSERT INTO intelligence_record_grants(resource_id,enabled,granted_by) VALUES (${id},${b.enabled as boolean},${actor.id}) ON CONFLICT(resource_id) DO UPDATE SET enabled=excluded.enabled,granted_by=excluded.granted_by,granted_at=now()`;
        await tx`INSERT INTO activity_logs(division_key,action_type,entity_label,page_label,actor_user_id,actor_name) VALUES ('sales','update',${'Intelligence access '+id+' '+b.enabled},'Intelligence Review',${actor.id},'ERP Owner')`;
      });
      return NextResponse.json({ok:true},{headers});
    }
    return NextResponse.json(await reviewByOwner(sql,actor.id,input),{headers});
  }catch(e){const err=e instanceof ContractError?e:new ContractError(503,'UNAVAILABLE','Belum dapat diproses. Coba lagi.');return NextResponse.json({error:err.message},{status:err.status,headers});}
}
export const GET=handle;export const POST=handle;
