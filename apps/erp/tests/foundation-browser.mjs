import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
export async function foundationBrowser({env,python,base,cookies}){
 assert.equal(base,'http://127.0.0.1:3310');
 const api=spawn(python,['-m','uvicorn','cdi.api:app','--host','127.0.0.1','--port','8000'],{env,stdio:['ignore','ignore','inherit']});
 const worker=spawn(python,['-m','cdi.worker'],{env,stdio:['ignore','ignore','inherit']});
 const web=spawn(process.execPath,['../web/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173'],{cwd:'../web',env,stdio:['ignore','ignore','inherit']});
 let browser;
 try{
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:8000/ready')).ok&&(await fetch('http://127.0.0.1:5173')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({headless:true,executablePath:process.env.ERP_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(token=>sessionStorage.setItem('cdi-token',token),env.API_ACCESS_TOKEN);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/app/knowledge');
  await page.getByRole('heading',{name:'Delivery acceptance playbook',exact:true}).waitFor();
  await page.getByLabel('Stable source key').fill('browser-reference');
  await page.getByLabel('Title',{exact:true}).fill('Browser verified reference');
  await page.getByLabel(/Source document/).setInputFiles({name:'reference.md',mimeType:'text/markdown',buffer:Buffer.from('Verify the handover owner and written acceptance before discussing integration delivery.')});
  await page.getByRole('button',{name:'Register draft',exact:true}).click();
  const card=page.locator('section').filter({has:page.getByRole('heading',{name:'Browser verified reference',exact:true})});
  await card.getByRole('button',{name:'Approve version',exact:true}).waitFor({timeout:30000});
  await card.getByRole('button',{name:'Approve version',exact:true}).click();
  await card.getByRole('button',{name:'Deprecate',exact:true}).waitFor();
  await mkdir('../../docs/implementation/evidence',{recursive:true});
  await page.screenshot({path:'../../docs/implementation/evidence/foundation-knowledge.png',fullPage:true});
  await page.goto('http://127.0.0.1:5173/app/outcomes');
  await page.getByRole('heading',{name:'READY FOR SALES',exact:true}).waitFor();
  await page.getByLabel('Correction or lesson').first().fill('Browser feedback: keep acceptance owner visible in the next review.');
  await page.getByRole('button',{name:'Record feedback',exact:true}).first().click();
  await page.getByText('Browser feedback: keep acceptance owner visible in the next review.',{exact:true}).waitFor();
  await page.getByText('Evaluation evidence & ERP receipt',{exact:true}).first().click();
  await page.screenshot({path:'../../docs/implementation/evidence/foundation-outcome.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:5173/app/knowledge');
  await page.getByRole('heading',{name:'Knowledge',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Browser verified reference',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile overflow');
  await page.screenshot({path:'../../docs/implementation/evidence/foundation-mobile.png',fullPage:true});
  await context.addCookies(cookies.map(([name,value])=>({name,value,url:base})));
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/intelligence');
  await page.getByRole('heading',{name:'Intelligence Review',exact:true}).waitFor();
  await page.getByRole('button',{name:/consumed.*Lihat paket/}).first().click();
  await page.locator('details summary').first().click();
  await page.screenshot({path:'../../docs/implementation/evidence/foundation-erp-review.png',fullPage:true});
  assert.deepEqual(errors,[],'browser runtime errors');
  console.log('PASS: foundation browser upload → worker ingestion → approve, outcome feedback, ERP review and mobile layout');
 }finally{await browser?.close();api.kill();worker.kill();web.kill();}
}
