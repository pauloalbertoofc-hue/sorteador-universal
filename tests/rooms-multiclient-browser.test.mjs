import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

// Two real, independent mobile browser contexts against the same isolated D1.
// No production Cloudflare credentials, no external services, no payments.
test('two mobile clients: classic remains private, live wheel shares winner and history',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({
  name:'rooms-browser',modules:[{type:'ESModule',path:'src/worker.js'},{type:'ESModule',path:'src/billing.js'}],
  compatibilityDate:'2026-10-24',d1Databases:['DB']
 }));
 await mf.ready;
 const db=await mf.getD1Database('DB');
 for(const file of ['0003_public_rooms.sql','0004_room_rate_limits.sql','0005_room_live_draw.sql','0006_room_draw_mode.sql']){
  const sql=(await readFile('migrations/'+file,'utf8')).replace(/^--.*$/gm,'');
  for(const statement of sql.split(';').filter(x=>x.trim()))await db.prepare(statement).run();
 }
 const html=await readFile('public/index.html');
 const server=createServer(async(req,res)=>{
  try{
   if(req.url.startsWith('/api/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const response=await mf.dispatchFetch('https://example.test'+req.url,{
     method:req.method,headers:{origin:'https://example.test','content-type':req.headers['content-type']||'application/json','x-room-admin-token':req.headers['x-room-admin-token']||'','cf-connecting-ip':'203.0.113.71'},
     ...(chunks.length?{body:Buffer.concat(chunks)}:{})
    });
    res.writeHead(response.status,{'content-type':'application/json'});res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);
  }catch(e){res.writeHead(500);res.end(String(e))}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 t.after(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));await mf.dispose()});
 browser=await chromium.launch({headless:true});
 const origin='http://127.0.0.1:'+server.address().port;
 const ownerContext=await browser.newContext({viewport:{width:390,height:844}});
 const guestContext=await browser.newContext({viewport:{width:390,height:844}});
 const owner=await ownerContext.newPage(),guest=await guestContext.newPage();
 const errors=[];
 for(const page of [owner,guest])page.on('pageerror',e=>errors.push(e.message));
 await owner.goto(origin);
 await owner.locator('#roomTitle').fill('Sorteio ao vivo');
 await owner.locator('#roomLimit').fill('3');
 await owner.locator('#roomDrawMode').selectOption('live');
 await owner.locator('#roomCreate').click();
 await owner.locator('#roomActive').waitFor({state:'visible'});
 assert.match(await owner.locator('#roomMeta').innerText(),/Roleta compartilhada/);
 const invite=await owner.locator('#roomLink').inputValue();
 await guest.goto(invite);
 await guest.locator('#roomActive').waitFor({state:'visible'});
 assert.equal(await guest.locator('#roomDraw').isVisible(),false);
 await guest.locator('#roomName').fill('Convidado');
 await guest.locator('#roomJoin').click();
 await owner.locator('#roomName').fill('Organizador');
 await owner.locator('#roomJoin').click();
 await owner.locator('#roomRefresh').click();
 assert.match(await owner.locator('#roomMeta').innerText(),/2 de 3 inscritos/);
 owner.once('dialog',dialog=>dialog.accept());
 await owner.locator('#roomClose').click();
 await owner.locator('#roomDraw').waitFor({state:'visible'});
 await owner.locator('#roomDraw').click();
 await guest.locator('#roomDrawHistory li').first().waitFor({timeout:12000});
 const first=(await owner.locator('#roomDrawHistory li').first().innerText());
 assert.equal(await guest.locator('#roomDrawHistory li').first().innerText(),first);
 await guest.locator('#roomWinner').waitFor({state:'visible',timeout:8000});
 assert.match(await guest.locator('#roomWinner').innerText(),/Convidado|Organizador/);
 await owner.locator('#roomDraw').click();
 await guest.locator('#roomDrawHistory li').nth(1).waitFor({timeout:12000});
 const winners=await guest.locator('#roomDrawHistory li').allInnerTexts();
 assert.equal(winners.length,2);
 assert.notEqual(winners[0].split(': ')[1]?.split(' · ')[0],winners[1].split(': ')[1]?.split(' · ')[0]);
 assert.equal(await guest.locator('#roomDraw').isVisible(),false);
 // Classic mode: participants only register; the live wheel is never shown.
 await owner.goto(origin);
 await owner.locator('#roomTitle').fill('Sorteio tradicional');
 await owner.locator('#roomDrawMode').selectOption('classic');
 await owner.locator('#roomCreate').click();
 await owner.locator('#roomActive').waitFor({state:'visible'});
 const classicInvite=await owner.locator('#roomLink').inputValue();
 await guest.goto(classicInvite);
 await guest.locator('#roomActive').waitFor({state:'visible'});
 assert.equal(await guest.locator('#roomLive').isVisible(),false);
 assert.equal(await owner.locator('#roomLive').isVisible(),false);
 assert.equal(await guest.locator('#roomUse').isVisible(),false);
 assert.deepEqual(errors,[]);
});
