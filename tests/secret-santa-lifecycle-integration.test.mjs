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
  const mismatch=await call(root+'/enroll',{inviteToken,name:'Consentimento divergente',entry:'guest',privacyAccepted:true,acceptedPrivacyMode:privacy==='private'?'supervised':'private'});
  assert.equal(mismatch.status,409);
  const claims=[];
  for(const name of ['Ana','Bruno','Carla']){
   const result=await call(root+'/enroll',{inviteToken,name,entry:'guest',privacyAccepted:true,acceptedPrivacyMode:privacy});
   assert.equal(result.status,201,JSON.stringify(result));
   claims.push(result.data.claimToken);
  }
  assert.equal((await call('/api/secret-santa/account/events/'+id+'/close-enrollment',{},stranger)).status,404);
  assert.equal((await call('/api/secret-santa/account/events/'+id+'/draw',{},owner)).status,409);
  assert.equal((await call('/api/secret-santa/account/events/'+id+'/close-enrollment',{},owner)).status,200);
  assert.equal((await call(root+'/enroll',{inviteToken,name:'Daniel',entry:'guest',privacyAccepted:true,acceptedPrivacyMode:privacy})).status,409);
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
  // Guest credentials are scoped to their event and must not act as invites.
  assert.equal((await call(root+'/claim-reveal',{claimToken:inviteToken})).status,403);
  assert.equal((await call(root+'/invite-info',{inviteToken:claims[0]})).status,404);
  assert.equal((await call(root+'/claim-reveal',{claimToken:claims[0].slice(0,-1)+(claims[0].endsWith('0')?'1':'0')})).status,403);
  assert.equal((await call(root+'/claim-reveal',{claimToken:claims[0]})).status,200);
  const auditPath='/api/secret-santa/account/events/'+id+'/assignments';
  assert.equal((await call(auditPath,{},stranger)).status,404);
  assert.equal((await call(auditPath,{})).status,401);
  const audit=await call(auditPath,{},owner);
  if(privacy==='private')assert.equal(audit.status,403);
  else{
   assert.equal(audit.status,200,JSON.stringify(audit));
   assert.equal(audit.data.assignments.length,3);
   const auditPairs=new Map(audit.data.assignments.map(a=>[a.giver,a.recipient]));
   assert.equal(auditPairs.size,3);
   assert.deepEqual(new Set(auditPairs.values()),new Set(['Ana','Bruno','Carla']));
   for(let i=0;i<claims.length;i++){
    const result=await call(root+'/claim-reveal',{claimToken:claims[i]});
    assert.equal(auditPairs.get(result.data.giver),result.data.recipient);
   }
  }
 }

 // A valid guest credential from one event cannot reveal a different event.
 const isolatedA=await call('/api/secret-santa/account/drafts',{title:'Evento isolado A',privacy:'private'},owner);
 const isolatedB=await call('/api/secret-santa/account/drafts',{title:'Evento isolado B',privacy:'private'},owner);
 assert.equal(isolatedA.status,201);
 assert.equal(isolatedB.status,201);
 const guestA=await call('/api/secret-santa/events/'+isolatedA.data.id+'/enroll',{inviteToken:isolatedA.data.inviteToken,name:'Visitante A',entry:'guest',privacyAccepted:true,acceptedPrivacyMode:'private'});
 assert.equal(guestA.status,201);
 assert.equal((await call('/api/secret-santa/events/'+isolatedB.data.id+'/claim-reveal',{claimToken:guestA.data.claimToken})).status,403);
 assert.equal((await call('/api/secret-santa/events/'+isolatedB.data.id+'/invite-info',{inviteToken:isolatedA.data.inviteToken})).status,404);

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
 const enrolledBeforeRotation=await call('/api/secret-santa/events/'+resumeId+'/enroll',{inviteToken:resumable.data.inviteToken,name:'Convidada antes da troca',entry:'guest',privacyAccepted:true,acceptedPrivacyMode:'private'});
 assert.equal(enrolledBeforeRotation.status,201);
 const retainedClaim=enrolledBeforeRotation.data.claimToken;
 const rotated=await call(resumePath+'/rotate-invite',{},owner);
 assert.equal(rotated.status,200);
 assert.notEqual(rotated.data.inviteToken,resumable.data.inviteToken);
 assert.equal((await call('/api/secret-santa/events/'+resumeId+'/invite-info',{inviteToken:resumable.data.inviteToken})).status,404);
 assert.equal((await call('/api/secret-santa/events/'+resumeId+'/invite-info',{inviteToken:rotated.data.inviteToken})).status,200);
 assert.equal((await call(resumePath+'/rotate-invite',{},stranger)).status,409);
 const enrolledAfterRotation=await call('/api/secret-santa/events/'+resumeId+'/enroll',{inviteToken:rotated.data.inviteToken,name:'Convidado depois da troca',entry:'guest',privacyAccepted:true,acceptedPrivacyMode:'private'});
 assert.equal(enrolledAfterRotation.status,201);
 assert.equal((await call('/api/secret-santa/events/'+resumeId+'/enroll',{inviteToken:resumable.data.inviteToken,name:'Convite revogado',entry:'guest',privacyAccepted:true,acceptedPrivacyMode:'private'})).status,404);
 assert.equal((await call(resumePath+'/close-enrollment',{},owner)).status,200);
 assert.equal((await call(resumePath+'/draw',{},owner)).status,200);
 const retainedResult=await call('/api/secret-santa/events/'+resumeId+'/claim-reveal',{claimToken:retainedClaim});
 assert.equal(retainedResult.status,200);
 assert.equal(retainedResult.data.giver,'Convidada antes da troca');
 assert.equal((await call('/api/secret-santa/events/'+resumeId+'/claim-reveal',{claimToken:enrolledAfterRotation.data.claimToken})).status,200);

 const missingConsent=await call('/api/secret-santa/events/'+resumeId+'/enroll',{inviteToken:rotated.data.inviteToken,name:'Sem consentimento',entry:'guest'});
 assert.equal(missingConsent.status,422);
 const accountEvent=await call('/api/secret-santa/account/drafts',{title:'Grupo com conta',privacy:'private'},owner);
 assert.equal(accountEvent.status,201);
 const accountId=accountEvent.data.id,accountInvite=accountEvent.data.inviteToken;
 const accountRoot='/api/secret-santa/events/'+accountId;
 const accountEnrollment=await call(accountRoot+'/enroll',{inviteToken:accountInvite,name:'Ana',entry:'account',privacyAccepted:true,acceptedPrivacyMode:'private'},owner);
 assert.equal(accountEnrollment.status,201);
 assert.equal(Object.hasOwn(accountEnrollment.data,'claimToken'),false);
 assert.equal((await call(accountRoot+'/enroll',{inviteToken:accountInvite,name:'Ana outra',entry:'account',privacyAccepted:true,acceptedPrivacyMode:'private'},owner)).status,409);
 assert.equal((await call(accountRoot+'/enroll',{inviteToken:accountInvite,name:'Bruno',entry:'guest',privacyAccepted:true,acceptedPrivacyMode:'private'})).status,201);
 assert.equal((await call('/api/secret-santa/account/events/'+accountId+'/close-enrollment',{},owner)).status,200);
 assert.equal((await call('/api/secret-santa/account/events/'+accountId+'/draw',{},owner)).status,200);
 const accountPath='/api/secret-santa/account/events/'+accountId+'/my-result';
 const mine=await call(accountPath,{},owner);
 assert.equal(mine.status,200,JSON.stringify(mine));
 assert.equal(mine.data.giver,'Ana');
 assert.equal(mine.data.recipient,'Bruno');
 assert.equal((await call(accountPath,{},stranger)).status,404);
 assert.equal((await call(accountPath,{})).status,401);

 // Simulate a whole classroom behind one IP with the actual API and a
 // rate limiter enforcing the supplied per-scope limits.
 const shared=await call('/api/secret-santa/account/drafts',{title:'Turma na mesma rede',privacy:'private'},owner);
 assert.equal(shared.status,201);
 const sharedRoot='/api/secret-santa/events/'+shared.data.id;
 const counters=new Map();
 const boundedLimit=async(scope,identity,limit)=>{
  const key=scope+':'+identity;
  const count=(counters.get(key)||0)+1;
  counters.set(key,count);
  return count<=limit;
 };
 const sharedCall=async(path,body)=>{
  const req=new Request('https://example.test'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const res=await secretSantaApi(req,env,path,boundedLimit,'198.51.100.23');
  return {status:res.status,data:await res.json()};
 };
 const sharedClaims=[];
 for(let i=0;i<100;i++){
  const result=await sharedCall(sharedRoot+'/enroll',{inviteToken:shared.data.inviteToken,name:'Participante '+i,entry:'guest',privacyAccepted:true,acceptedPrivacyMode:'private'});
  assert.equal(result.status,201,'Shared IP enrollment '+i+': '+JSON.stringify(result));
  sharedClaims.push(result.data.claimToken);
 }
 assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM secret_santa_enrollments WHERE event_id=?').bind(shared.data.id).first()).total,100);
 assert.equal(counters.get('secret-santa-group-enroll:198.51.100.23'),100);
 assert.equal(counters.get('secret-santa-enroll-event:198.51.100.23:'+shared.data.id),100);
 const overflow=await sharedCall(sharedRoot+'/enroll',{inviteToken:shared.data.inviteToken,name:'Participante 101',entry:'guest',privacyAccepted:true,acceptedPrivacyMode:'private'});
 assert.notEqual(overflow.status,201);
 assert.equal((await call('/api/secret-santa/account/events/'+shared.data.id+'/close-enrollment',{},owner)).status,200);
 const fullDraw=await call('/api/secret-santa/account/events/'+shared.data.id+'/draw',{},owner);
 assert.equal(fullDraw.status,200,JSON.stringify(fullDraw));
 assert.equal(fullDraw.data.participants,100);
 const recipients=new Set();
 for(let i=0;i<100;i++){
  const reveal=await call(sharedRoot+'/claim-reveal',{claimToken:sharedClaims[i]});
  assert.equal(reveal.status,200,JSON.stringify(reveal));
  assert.equal(reveal.data.giver,'Participante '+i);
  assert.notEqual(reveal.data.giver,reveal.data.recipient);
  recipients.add(reveal.data.recipient);
 }
 assert.equal(recipients.size,100);

 // Two simultaneous requests compete for the final seat. The capacity check
 // is inside the INSERT statement, not a stale application-side preflight.
 const race=await call('/api/secret-santa/account/drafts',{title:'Última vaga concorrente',privacy:'private'},owner);
 assert.equal(race.status,201);
 const raceRoot='/api/secret-santa/events/'+race.data.id;
 for(let i=0;i<99;i++){
  const enrolled=await call(raceRoot+'/enroll',{inviteToken:race.data.inviteToken,name:'Pessoa '+i,entry:'guest',privacyAccepted:true,acceptedPrivacyMode:'private'});
  assert.equal(enrolled.status,201);
 }
 const [first,last]=await Promise.all(['Pessoa final A','Pessoa final B'].map(name=>
  call(raceRoot+'/enroll',{inviteToken:race.data.inviteToken,name,entry:'guest',privacyAccepted:true,acceptedPrivacyMode:'private'})));
 assert.deepEqual([first.status,last.status].sort((a,b)=>a-b),[201,409]);
 const finalCount=await db.prepare('SELECT COUNT(*) AS total FROM secret_santa_enrollments WHERE event_id=?').bind(race.data.id).first();
 assert.equal(finalCount.total,100);

 // Concurrent draw attempts must never replace or duplicate the assignments.
 const drawRace=await call('/api/secret-santa/account/drafts',{title:'Sorteio concorrente',privacy:'private'},owner);
 assert.equal(drawRace.status,201);
 const drawRaceRoot='/api/secret-santa/events/'+drawRace.data.id;
 const drawClaims=[];
 for(const name of ['Aline','Beto','Cecília']){
  const enrolled=await call(drawRaceRoot+'/enroll',{inviteToken:drawRace.data.inviteToken,name,entry:'guest',privacyAccepted:true,acceptedPrivacyMode:'private'});
  assert.equal(enrolled.status,201);
  drawClaims.push(enrolled.data.claimToken);
 }
 const drawEndpoint='/api/secret-santa/account/events/'+drawRace.data.id+'/draw';
 assert.equal((await call('/api/secret-santa/account/events/'+drawRace.data.id+'/close-enrollment',{},owner)).status,200);
 const drawAttempts=await Promise.allSettled([call(drawEndpoint,{},owner),call(drawEndpoint,{},owner)]);
 assert.equal(drawAttempts.filter(x=>x.status==='fulfilled'&&x.value.status===200).length,1,JSON.stringify(drawAttempts));
 assert.equal(drawAttempts.filter(x=>x.status==='fulfilled'&&x.value.status===409).length,1,JSON.stringify(drawAttempts));
 const saved=(await db.prepare('SELECT id,recipient_id FROM secret_santa_participants WHERE event_id=?').bind(drawRace.data.id).all()).results;
 assert.equal(saved.length,3);
 assert.equal(new Set(saved.map(x=>x.recipient_id)).size,3);
 for(const claimToken of drawClaims)assert.equal((await call(drawRaceRoot+'/claim-reveal',{claimToken})).status,200);
});
