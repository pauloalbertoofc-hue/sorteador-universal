import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import worker from '../src/worker.js';

test('password reset: expiry, one-time consumption, concurrent submissions and session revocation',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({
  name:'password-reset-integration',modules:[{type:'ESModule',path:'src/worker.js'},{type:'ESModule',path:'src/billing.js'},{type:'ESModule',path:'src/secret-santa.js'},{type:'ESModule',path:'public/amigo-secreto/engine.mjs'}],
  compatibilityDate:'2026-10-24',d1Databases:['DB']
 }));
 t.after(()=>mf.dispose());await mf.ready;
 const db=await mf.getD1Database('DB');
 for(const name of (await readdir('migrations/preview')).filter(n=>n.endsWith('.sql')).sort()){
  const sql=(await readFile('migrations/preview/'+name,'utf8')).replace(/^--.*$/gm,'');
  for(const statement of sql.split(';').filter(s=>s.trim()))await db.prepare(statement).run();
 }
 const base='https://example.test',email='reset@example.test',oldPassword='Old-password-123',newPassword='New-password-456';
 const env={DB:db};
 async function post(path,data,origin=base,ctx){
  return worker.fetch(new Request(base+path,{method:'POST',headers:{origin,'content-type':'application/json','cf-connecting-ip':'203.0.113.9'},body:JSON.stringify(data)}),env,ctx);
 }
 const reg=await post('/api/register',{email,password:oldPassword});
 assert.equal(reg.status,201);
 // Profile records are scoped to the authenticated account.
 const cookie=reg.headers.get('set-cookie').split(';')[0];
 const profileRequest=(method='GET',body,session=cookie,origin=base)=>worker.fetch(new Request(base+'/api/profile',{method,headers:{cookie:session,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
 assert.equal((await profileRequest('GET',null,'')).status,401);
 assert.deepEqual((await (await profileRequest()).json()).profile,{full_name:'',display_name:'',username:null});
 const data={full_name:'Pessoa de Teste',display_name:'Teste',username:'TESTE_123'};
 assert.equal((await profileRequest('POST',data,cookie,'https://wrong.example')).status,403);
 assert.equal((await profileRequest('POST',{...data,username:'!!'})).status,400);
 assert.equal((await profileRequest('POST',data)).status,200);
 assert.deepEqual((await (await profileRequest()).json()).profile,{...data,username:'teste_123'});
 const other=await post('/api/register',{email:'profile-isolation@example.test',password:oldPassword});
 assert.equal(other.status,201);
 const otherCookie=other.headers.get('set-cookie').split(';')[0];
 assert.deepEqual((await (await profileRequest('GET',null,otherCookie)).json()).profile,{full_name:'',display_name:'',username:null});
 assert.equal((await profileRequest('POST',data,otherCookie)).status,409);
 assert.equal((await profileRequest('POST',{...data,full_name:'Invalid'+String.fromCharCode(1)})).status,400);
 assert.deepEqual((await (await profileRequest()).json()).profile,{...data,username:'teste_123'});


 const user=await db.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
 const digest=token=>createHash('sha256').update(token).digest('hex');
 async function seed(token,expires){
  await db.prepare('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at').bind(user.id,digest(token),expires).run();
 }
 const token='a'.repeat(64),expired='b'.repeat(64);
 assert.equal((await post('/api/password/request',{email})).status,503);
 assert.equal((await post('/api/password/reset',{token,password:newPassword},'https://wrong.example')).status,403);
 assert.equal((await post('/api/password/reset',{token:'invalid',password:newPassword})).status,400);
 await seed(expired,Date.now()-1000);
 assert.equal((await post('/api/password/reset',{token:expired,password:newPassword})).status,400);
 await seed(token,Date.now()+900000);
 assert.equal((await post('/api/password/reset',{token,password:'short'})).status,400);
 assert.equal((await post('/api/password/reset',{token,password:'x'.repeat(129)})).status,400);
 const attempts=await Promise.all([post('/api/password/reset',{token,password:newPassword}),post('/api/password/reset',{token,password:newPassword})]);
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,400]);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').bind(user.id).first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE user_id=?').bind(user.id).first()).n,0);
 assert.equal((await post('/api/password/reset',{token,password:oldPassword})).status,400);
 assert.equal((await post('/api/login',{email,password:oldPassword})).status,401);
 assert.equal((await post('/api/login',{email,password:newPassword})).status,200);
 await seed(expired,Date.now()-1000);
 await worker.scheduled({},env);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE user_id=?').bind(user.id).first()).n,0);
 // Mock the provider in the Node process; no network or real credentials.
 const sent=[];
 let providerStatus=200;
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');
  sent.push(JSON.parse(options.body));
  return new Response('{}',{status:providerStatus});
 });
 Object.assign(env,{RESET_EMAIL_API_KEY:'test-only',RESET_EMAIL_FROM:'test@example.test',RESET_SITE_URL:base});
 const unknown=await post('/api/password/request',{email:'unknown@example.test'});
 const first=await post('/api/password/request',{email});
 assert.equal(first.status,200);
 assert.deepEqual(await first.json(),await unknown.json());
 assert.equal(sent.length,1);
 const extract=mail=>mail.text.match(/#su-reset=([a-f0-9]{64})/)[1];
 const firstToken=extract(sent[0]);
 let stored=await db.prepare('SELECT token_hash,expires_at FROM password_resets WHERE user_id=?').bind(user.id).first();
 assert.equal(stored.token_hash,digest(firstToken));
 assert.ok(stored.expires_at>Date.now()&&stored.expires_at<=Date.now()+900000);
 assert.equal((await post('/api/password/request',{email})).status,200);
 assert.equal(sent.length,2);
 const secondToken=extract(sent[1]);
 assert.notEqual(firstToken,secondToken);
 assert.equal((await post('/api/password/reset',{token:firstToken,password:oldPassword})).status,400);
 providerStatus=500;
 assert.equal((await post('/api/password/request',{email})).status,200);
 assert.equal(sent.length,3);
 assert.equal(await db.prepare('SELECT token_hash FROM password_resets WHERE user_id=?').bind(user.id).first(),null);
 assert.equal((await post('/api/password/request',{email})).status,200);
 assert.equal(sent.length,3,'email rate limit suppresses further delivery');
 // Exercise the real execution-context branch without waiting for the provider.
 const asyncEmail='async-reset@example.test';
 assert.equal((await post('/api/register',{email:asyncEmail,password:oldPassword})).status,201);
 let release,entered;
 const gate=new Promise(resolve=>{release=resolve;});
 const started=new Promise(resolve=>{entered=resolve;});
 globalThis.fetch=async (url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');
  entered();await gate;
  return new Response('{}',{status:200});
 };
 const pending=[],ctx={waitUntil(promise){pending.push(promise);}};
 try{
  const response=await post('/api/password/request',{email:asyncEmail},base,ctx);
  assert.equal(response.status,200);
  assert.equal(pending.length,1);
  await started;
  let finished=false;pending[0].then(()=>{finished=true;});
  await Promise.resolve();assert.equal(finished,false);
  release();await Promise.all(pending);
  assert.equal(finished,true);
  const absent=await post('/api/password/request',{email:'absent-async@example.test'},base,ctx);
  assert.deepEqual(await absent.json(),await response.json());
  assert.equal(pending.length,2);await Promise.all(pending);
 }finally{release();await Promise.allSettled(pending);}
 env.RESET_SITE_URL='https://wrong.example';
 assert.equal((await post('/api/password/request',{email})).status,503);
 assert.equal((await post('/api/password/request',{email:'unknown@example.test'})).status,503);

});
