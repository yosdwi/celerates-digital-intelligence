import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/db';
import { authenticateMachine, ContractError, fail, text, uuid } from '@/lib/integration/contract';
import { applyCommand, listResources, proposeReview, readEvents, readResource } from '@/lib/integration/service';
import { handleAgent } from '@/lib/agent/contract';
import { randomUUID } from 'node:crypto';
export const dynamic='force-dynamic';
async function handle(request: NextRequest, params: Promise<{path:string[]}>) {
  const correlation=request.headers.get('x-correlation-id')?.match(/^[a-zA-Z0-9:_-]{1,100}$/)?.[0]||randomUUID();
  const headers={'Cache-Control':'private, no-store','X-Correlation-Id':correlation};
  try {
    const {path}=await params;
    const principal=authenticateMachine(request.headers,request.method==='POST'&&['commands','review-requests','agent'].includes(path[0])?'action':'read');
    let result: unknown;
    if(path[0]==='agent') result=await handleAgent(request,path,sql);
    else if(request.method==='GET'&&path[0]==='resources'&&path[1]==='sales_opportunity'&&path.length<=3) {
      if(path[2])result=await readResource(sql,uuid(path[2]));
      else{const cursor=request.nextUrl.searchParams.get('cursor')||undefined;if(cursor)uuid(cursor);const limit=Number(request.nextUrl.searchParams.get('limit')||50);if(!Number.isInteger(limit)||limit<1||limit>100)fail(422,'SCHEMA','Invalid limit.');result=await listResources(sql,cursor,limit);}
    } else if(request.method==='GET'&&path[0]==='events'&&path.length===1) {
      const cursor=Number(request.nextUrl.searchParams.get('cursor')||0),limit=Number(request.nextUrl.searchParams.get('limit')||50);
      if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>100)fail(422,'SCHEMA','Invalid cursor/limit.');result=await readEvents(sql,cursor,limit);
    } else if(request.method==='GET'&&path[0]==='commands'&&path.length===2) {
      const [command]=await sql`SELECT receipt,resource_id FROM intelligence_commands WHERE id=${uuid(path[1])} AND principal=${principal}`;
      if(!command)fail(404,'NOT_FOUND','Command not found.');await readResource(sql,command.resource_id);result=command.receipt;
    } else if(request.method==='POST'&&path.length===1&&['review-requests','commands'].includes(path[0])) {
      const key=text(request.headers.get('idempotency-key'),160);if(key.length<8)fail(422,'SCHEMA','Idempotency-Key required.');
      const raw=await request.text();if(Buffer.byteLength(raw)>262144)fail(413,'TOO_LARGE','Maximum payload is 256 KiB.');
      let input:unknown;try{input=JSON.parse(raw);}catch{fail(422,'SCHEMA','Invalid JSON.');}
      result=path[0]==='commands'?await applyCommand(sql,principal,key,input):await proposeReview(sql,principal,key,input);
    } else fail(404,'NOT_FOUND','Contract operation not available.');
    return NextResponse.json(result,{headers});
  }catch(error){const e=error instanceof ContractError?error:new ContractError(503,'UNAVAILABLE','Service unavailable.');return NextResponse.json({error:{code:e.code,message:e.message,retryable:e.status===503,correlation_id:correlation}},{status:e.status,headers});}
}
export async function GET(request: NextRequest, {params}:{params:Promise<{path:string[]}>}){return handle(request,params);}
export async function POST(request: NextRequest, {params}:{params:Promise<{path:string[]}>}){return handle(request,params);}
