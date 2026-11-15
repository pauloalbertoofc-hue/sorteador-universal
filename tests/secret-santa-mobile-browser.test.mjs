import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('Amigo Secreto: two isolated mobile browsers, private links and unique recipients', {timeout:45000}, async t => {
  const mf=new Miniflare(convertV4MiniflareOptions({
    name:'santa-browser', modules:[
      {type:'ESModule',path:'src/worker.js'},
      {type:'ESModule',path:'src/billing.js'},
      {type:'ESModule',path:'src/secret-santa.js'},
      {type:'ESModule',path:'public/amigo-secreto/engine.mjs'}
    ],compatibilityDate:'2026-10-24',d1Databases:['DB']
  }));
  let browser,server;
  t.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mf.dispose()});
  await mf.ready;
  const db=await mf.getD1Database('DB');
  for(const file of ['migrations/0004_room_rate_limits.sql','migrations/0007_secret_santa_private_storage.sql']){
    const sql=(await readFile(file,'utf8')).replace(/^--.*$/gm,'');
    for(const statement of sql.split(';').filter(x=>x.trim()))await db.prepare(statement).run();
  }
  const html=await readFile('public/amigo-secreto/index.html');
  const script=await readFile('public/amigo-secreto/app.mjs');
  server=createServer(async(req,res)=>{
    try{
      if(req.url.startsWith('/api/')){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const response=await mf.dispatchFetch('http://'+req.headers.host+req.url,{
          method:req.method,
          headers:{origin:'http://'+req.headers.host,'content-type':req.headers['content-type']||'application/json','cf-connecting-ip':'203.0.113.81'},
          ...(chunks.length?{body:Buffer.concat(chunks)}:{})
        });
        res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'});
        res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      if(req.url==='/amigo-secreto/app.mjs'){
        res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(script);return;
      }
      if(req.url.startsWith('/amigo-secreto/')){
        res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;
      }
      res.writeHead(404);res.end();
    }catch(error){res.writeHead(500);res.end(String(error))}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  const organizer=await browser.newPage({viewport:{width:390,height:844}});
  const guest=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];for(const page of [organizer,guest])page.on('pageerror',e=>errors.push(e.message));
  await organizer.goto(origin+'/amigo-secreto/');
  await organizer.locator('#title').fill('Amigos da faculdade');
  await organizer.locator('#names').fill(['Ana','Bruno','Carla'].join(String.fromCharCode(10)));
  await organizer.locator('#createButton').click();
  await organizer.locator('#linksSection').waitFor({state:'visible'});
  assert.equal(await organizer.locator('.person').count(),3);
  const event=(await db.prepare('SELECT id FROM secret_santa_events').first()).id;
  const members=(await db.prepare('SELECT display_name FROM secret_santa_participants WHERE event_id=?').bind(event).all()).results;
  assert.equal(members.length,3);
  const displayedNames=await organizer.locator('.person strong').allInnerTexts();
  assert.deepEqual(new Set(displayedNames),new Set(members.map(member=>member.display_name)));
  const allRecipients=new Set();
  const tokenLinks=await organizer.evaluate(async()=>{
    const buttons=[...document.querySelectorAll('.person .secondary')];
    const result=[];
    const original=navigator.clipboard.writeText;
    // Browser permissions can differ; extract the generated link through the click handler's
    // copy payload using a clipboard stub in this isolated test page only.
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>result.push(text)}});
    for(const button of buttons)button.click();
    await new Promise(resolve=>setTimeout(resolve,50));
    return result;
  });
  assert.equal(tokenLinks.length,3);
  for(let i=0;i<tokenLinks.length;i++){
    const url=new URL(tokenLinks[i]);
    assert.equal(url.search,'');
    assert.match(url.hash,/#event=/);
    await guest.goto(url.toString());
    await guest.waitForFunction(expected => document.querySelector('#giver')?.textContent === 'Olá, ' + expected + '!' && document.querySelector('#revealResult')?.classList.contains('hidden') === false, displayedNames[i]);
    const giver=await guest.locator('#giver').innerText();
    const recipient=await guest.locator('#recipient').innerText();
    assert.ok(giver.includes(displayedNames[i]),JSON.stringify({giver,expected:displayedNames[i],linkIndex:i}));
    assert.notEqual(recipient,displayedNames[i]);
    allRecipients.add(recipient);
    assert.equal(await guest.locator('#linksSection').isVisible(),false);
  }
  assert.equal(allRecipients.size,3);
  await guest.goto(origin+'/amigo-secreto/#event='+event+'&token='+'0'.repeat(64));
  await guest.waitForFunction(()=>document.querySelector('#revealStatus')?.textContent?.includes('Link inválido ou expirado'));
  assert.equal(await guest.locator('#revealResult').isVisible(),false);
  assert.deepEqual(errors,[]);
});
