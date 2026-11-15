import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {secretSantaApi} from '../src/secret-santa.js';

test('new Secret Santa lifecycle: two guests, owner isolation, private and supervised audit', {timeout:45000},async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({
  name:'santa-lifecycle',modules:[
   {type:'ESModule',path:'src/worker.js'},
   {type:'ESModule',path:'src/billing.js'},
   {type:'ESModule',path:'src/secret-santa.js'},
   {type:'ESModule',path:'public/amigo-secreto/engine.mjs'}
  ],compatibilityDate:'2026-10-24',d1Databases:['DB']
 }));
 t.after(()=>mf.dispose());
 await mf.ready;
 const db=await mf.getD1Database('DB');
 await db.prepare('CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL)').run();
 for(const file of ['migrations/0007_secret_santa_private_storage.sql','migrations/0008_secret_santa_identity.sql']){
  const sql=(await readFile(file,'utf8')).replace(/^--.*$/gm,'');
  for(const statement of sql.split(';').filter(x=>x.trim()))await db.prepare(statement).run();
 }
 await db.prepare("INSERT INTO users(id) VALUES ('owner'),('stranger')").run();
 const env={DB:db},owner={id:'owner'},stranger={id:'stranger'};
 const call=async(path,body,user=null)=>{
  const req=new Request('https://example.test'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const res=await secretSantaApi(req,env,path,async()=>true,'203.0.113.2',user);
  return {status:res.status,data:await res.json()};
 };
 for(const privacy of ['private','supervised']){
  const created=await call('/api/secret-santa/account/drafts',{title:'Grupo '+privacy,privacy},owner);
  assert.equal(created.status,201,JSON.stringify(created));
  const {id,inviteToken}=created.data;
  const root='/api/secret-santa/events/'+id;
  const info=await call(root+'/invite-info',{inviteToken});
  assert.equal(info.status,200);
  assert.equal(info.data.organizerCanViewResults,privacy==='supervised');
  const claims=[];
  for(const name of ['Ana','Bruno','Carla']){
   const result=await call(root+'/enroll',{inviteToken,name,entry:'guest'});
   assert.equal(result.status,201,JSON.stringify(result));
   claims.push(result.data.claimToken);
  }
  assert.equal((await call('/api/secret-santa/account/events/'+id+'/close-enrollment',{},stranger)).status,404);
  assert.equal((await call('/api/secret-santa/account/events/'+id+'/draw',{},owner)).status,409);
  assert.equal((await call('/api/secret-santa/account/events/'+id+'/close-enrollment',{},owner)).status,200);
  assert.equal((await call(root+'/enroll',{inviteToken,name:'Daniel',entry:'guest'})).status,409);
  const closedInvite=await call(root+'/invite-info',{inviteToken});
  assert.equal(closedInvite.status,200);
  assert.equal(closedInvite.data.enrollmentClosed,true);

  const drawn=await call('/api/secret-santa/account/events/'+id+'/draw',{},owner);
  assert.equal(drawn.status,200,JSON.stringify(drawn));
  assert.equal(drawn.data.participants,3);
  assert.equal(Object.hasOwn(drawn.data,'assignments'),false);
  assert.equal((await call('/api/secret-santa/account/events/'+id+'/draw',{},owner)).status,409);
  const recipients=new Set();
  for(let i=0;i<claims.length;i++){
   const result=await call(root+'/claim-reveal',{claimToken:claims[i]});
   assert.equal(result.status,200,JSON.stringify(result));
   assert.equal(result.data.giver,['Ana','Bruno','Carla'][i]);
   assert.notEqual(result.data.giver,result.data.recipient);
   recipients.add(result.data.recipient);
  }
  assert.equal(recipients.size,3);
  assert.equal((await call(root+'/claim-reveal',{claimToken:'0'.repeat(64)})).status,403);
  const auditPath='/api/secret-santa/account/events/'+id+'/assignments';
  assert.equal((await call(auditPath,{},stranger)).status,404);
  const audit=await call(auditPath,{},owner);
  if(privacy==='private')assert.equal(audit.status,403);
  else{
   assert.equal(audit.status,200,JSON.stringify(audit));
   assert.equal(audit.data.assignments.length,3);
  }
 }

 const resumable=await call('/api/secret-santa/account/drafts',{title:'Evento recuperável',privacy:'private'},owner);
 assert.equal(resumable.status,201);
 const resumeId=resumable.data.id;
 const resumePath='/api/secret-santa/account/events/'+resumeId;
 assert.equal((await call(resumePath+'/manage',{},stranger)).status,404);
 const recovered=await secretSantaApi(new Request('https://example.test'+resumePath+'/manage'),env,resumePath+'/manage',async()=>true,'203.0.113.2',owner);
 assert.equal(recovered.status,200);
 const recoveredData=await recovered.json();
 assert.equal(recoveredData.privacy,'private');
 assert.equal(Object.hasOwn(recoveredData,'inviteToken'),false);
 const rotated=await call(resumePath+'/rotate-invite',{},owner);
 assert.equal(rotated.status,200);
 assert.notEqual(rotated.data.inviteToken,resumable.data.inviteToken);
 assert.equal((await call('/api/secret-santa/events/'+resumeId+'/invite-info',{inviteToken:resumable.data.inviteToken})).status,404);
 assert.equal((await call('/api/secret-santa/events/'+resumeId+'/invite-info',{inviteToken:rotated.data.inviteToken})).status,200);
 assert.equal((await call(resumePath+'/rotate-invite',{},stranger)).status,409);
 const accountEvent=await call('/api/secret-santa/account/drafts',{title:'Grupo com conta',privacy:'private'},owner);
 assert.equal(accountEvent.status,201);
 const accountId=accountEvent.data.id,accountInvite=accountEvent.data.inviteToken;
 const accountRoot='/api/secret-santa/events/'+accountId;
 assert.equal((await call(accountRoot+'/enroll',{inviteToken:accountInvite,name:'Ana',entry:'account'},owner)).status,201);
 assert.equal((await call(accountRoot+'/enroll',{inviteToken:accountInvite,name:'Ana outra',entry:'account'},owner)).status,409);
 assert.equal((await call(accountRoot+'/enroll',{inviteToken:accountInvite,name:'Bruno',entry:'guest'})).status,201);
 assert.equal((await call('/api/secret-santa/account/events/'+accountId+'/close-enrollment',{},owner)).status,200);
 assert.equal((await call('/api/secret-santa/account/events/'+accountId+'/draw',{},owner)).status,200);
 const accountPath='/api/secret-santa/account/events/'+accountId+'/my-result';
 const mine=await call(accountPath,{},owner);
 assert.equal(mine.status,200,JSON.stringify(mine));
 assert.equal(mine.data.giver,'Ana');
 assert.equal(mine.data.recipient,'Bruno');
 assert.equal((await call(accountPath,{},stranger)).status,404);
 assert.equal((await call(accountPath,{})).status,401);
});
