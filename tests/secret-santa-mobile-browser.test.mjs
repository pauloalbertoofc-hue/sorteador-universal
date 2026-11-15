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
    // A new recipient opens their private link in a fresh tab; navigating only the hash
    // of the same document does not rerun this page's initialization script.
    // Force a new document so app.mjs re-runs for each private fragment link.
    await guest.goto('about:blank');
    await guest.goto(url.toString());
    // Wait for an actual terminal state, not the intermediate loading message.
    await guest.waitForFunction(() => {
      const result = document.querySelector('#revealResult');
      const message = document.querySelector('#revealStatus')?.textContent?.trim() || '';
      return result?.classList.contains('hidden') === false ||
        (message !== '' && message !== 'Carregando seu resultado…' &&
         message !== 'Resultado encontrado.');
    }, null, {timeout:5000}).catch(async error => {
      throw new Error('Revelação não concluída: '+JSON.stringify({
        status:await guest.locator('#revealStatus').innerText(),
        pageErrors:errors
      })+'; '+error.message);
    });
    assert.equal(await guest.locator('#revealResult').isVisible(),true,
      'Revelação falhou: '+await guest.locator('#revealStatus').innerText());
    const giver=await guest.locator('#giver').innerText();
    const recipient=await guest.locator('#recipient').innerText();
    assert.ok(giver.includes(displayedNames[i]),JSON.stringify({giver,expected:displayedNames[i],linkIndex:i}));
    assert.notEqual(recipient,displayedNames[i]);
    allRecipients.add(recipient);
    assert.equal(await guest.locator('#linksSection').isVisible(),false);
  }
  assert.equal(allRecipients.size,3);
  // A fragment-only navigation does not rerun the reveal initializer.
  await guest.goto('about:blank');
  await guest.goto(origin+'/amigo-secreto/#event='+event+'&token='+'0'.repeat(64));
  await guest.waitForFunction(()=>document.querySelector('#revealStatus')?.textContent?.includes('Link inválido ou expirado'),null,{timeout:5000});
  assert.equal(await guest.locator('#revealResult').isVisible(),false);
  assert.deepEqual(errors,[]);
});

test('group mode: mobile navigation, organizer recovery and guest private link', {timeout:30000},async t=>{
 const html=await readFile('public/amigo-secreto/novo/index.html');
 const js=await readFile('public/amigo-secreto/novo/app.mjs');
 const eventId='12345678-1234-4123-8123-123456789abc';
 const inviteToken='a'.repeat(64),claimToken='b'.repeat(64);
 let server,browser;
 t.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
 server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/amigo-secreto/novo/app.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(js);return;}
  if(pathname==='/amigo-secreto/novo/'||pathname==='/amigo-secreto/novo/index.html'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
  if(pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
   let data={},status=200;
   if(pathname.endsWith('/invite-info'))data={id:eventId,title:'Amigos da turma',privacy:'private',status:'draft',enrollmentClosed:false};
   else if(pathname==='/api/me')data={user:req.headers.cookie?.includes('su_session=test-session')?{id:'account-ana',email:'ana@example.test'}:null};
   else if(pathname==='/api/login'){if(body.email==='ana@example.test'&&body.password==='senha-valida-123'){data={ok:true};res.setHeader('set-cookie','su_session=test-session; Path=/api; HttpOnly; SameSite=Strict');}else{status=401;data={error:'Credenciais inválidas'};}}
   else if(pathname.endsWith('/enroll')){if(body.entry==='account'&&!req.headers.cookie?.includes('su_session=test-session')){status=401;data={error:'Entre na sua conta para continuar.'};}else data=body.entry==='account'?{id:'member',name:body.name,entry:'account',status:'enrolled'}:{id:'member',name:body.name,entry:'guest',claimToken,status:'enrolled'};}
   else if(pathname.endsWith('/my-result'))data={title:'Amigos da turma',giver:'Ana',recipient:'Bruno'};
   else if(pathname.endsWith('/claim-reveal'))data={title:'Amigos da turma',giver:'Ana',recipient:'Bruno'};
   else if(pathname.endsWith('/account/events')&&req.method==='GET')data={events:[{id:eventId,title:'Amigos da turma',status:'draft'}]};
   else if(pathname.endsWith('/manage'))data={id:eventId,title:'Amigos da turma',status:'draft',privacy:'private',enrollmentClosed:false,participants:2};
   else if(pathname.endsWith('/rotate-invite'))data={id:eventId,inviteToken,previousInvitesRevoked:true};
   else {status=404;data={error:'Rota inesperada'};}
   res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
 const organizer=await browser.newPage({viewport:{width:390,height:844}});
 const guest=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];for(const page of [organizer,guest])page.on('pageerror',e=>errors.push(e.message));
 await organizer.goto(origin+'/amigo-secreto/novo/');
 await organizer.locator('#loadEvents').click();
 await organizer.locator('#eventList button').click();
 await organizer.locator('#manage').waitFor({state:'visible'});
 assert.equal(await organizer.locator('#share').isDisabled(),true);
 assert.equal(await organizer.locator('#rotateInvite').isEnabled(),true);
 organizer.on('dialog',dialog=>dialog.accept());
 await organizer.locator('#rotateInvite').click();
 await organizer.getByText('Novo convite gerado.',{exact:false}).waitFor({timeout:5000});
 const inviteUrl=origin+'/amigo-secreto/novo/#event='+eventId+'&invite='+inviteToken;
 await guest.goto(inviteUrl);
 await guest.locator('#enrollButton').waitFor({state:'visible'});
 await guest.locator('#name').fill('Ana');
 await guest.locator('#privacyConsent').check();
 await guest.locator('#enrollButton').click();
 await guest.locator('#claim').waitFor({state:'visible'});
 assert.match(guest.url(),/claim=/);
 assert.doesNotMatch(guest.url(),/invite=/);
 await guest.locator('#checkResult').click();
 await guest.getByText('Olá, Ana! Você tirou: Bruno.').waitFor();
 const account=await browser.newPage({viewport:{width:390,height:844}});
 account.on('pageerror',e=>errors.push(e.message));
 await account.goto(inviteUrl);
 await account.locator('#enrollButton').waitFor({state:'visible'});
 await account.locator('#name').fill('Ana');
 await account.locator('#entry').selectOption('account');
 await account.locator('#privacyConsent').check();
 await account.locator('#enrollButton').click();
 await account.locator('#signIn').waitFor({state:'visible'});
 assert.match(account.url(),/invite=/);
 await account.locator('#signInEmail').fill('ana@example.test');
 await account.locator('#signInPassword').fill('senha-valida-123');
 await account.locator('#signInButton').click();
 await account.getByText('Conta conectada.',{exact:false}).waitFor();
 assert.match(account.url(),/invite=/);
 await account.locator('#enrollButton').click();
 await account.locator('#claim').waitFor({state:'visible'});
 assert.match(account.url(),/account=1/);
 assert.doesNotMatch(account.url(),/claim=/);
 assert.equal(await account.locator('#copyClaim').isVisible(),false);
 await account.locator('#checkResult').click();
 await account.getByText('Olá, Ana! Você tirou: Bruno.').waitFor();
 await account.close();
 assert.deepEqual(errors,[]);
});
