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
 async function post(path,data,origin=base){
  return worker.fetch(new Request(base+path,{method:'POST',headers:{origin,'content-type':'application/json','cf-connecting-ip':'203.0.113.9'},body:JSON.stringify(data)}),env);
 }
 const reg=await post('/api/register',{email,password:oldPassword});
 assert.equal(reg.status,201);
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
 env.RESET_SITE_URL='https://wrong.example';
 assert.equal((await post('/api/password/request',{email})).status,503);
 assert.equal((await post('/api/password/request',{email:'unknown@example.test'})).status,503);

});
