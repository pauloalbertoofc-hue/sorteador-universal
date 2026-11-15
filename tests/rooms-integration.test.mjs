import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

// Real workerd + isolated in-memory D1. No production credentials or network.
test('public rooms: create, duplicate/capacity, close, expiry cleanup and rate limits',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({
  name:'room-integration',modules:[{type:'ESModule',path:'src/worker.js'},{type:'ESModule',path:'src/billing.js'},{type:'ESModule',path:'src/secret-santa.js'},{type:'ESModule',path:'public/amigo-secreto/engine.mjs'}],
  compatibilityDate:'2026-10-24',d1Databases:['DB']
 }));
 t.after(()=>mf.dispose());await mf.ready;
 const db=await mf.getD1Database('DB');
 for(const file of ['migrations/0003_public_rooms.sql','migrations/0004_room_rate_limits.sql','migrations/0005_room_live_draw.sql','migrations/0006_room_draw_mode.sql']){
  const sql=(await readFile(file,'utf8')).replace(/^--.*$/gm,'');
  for(const statement of sql.split(';').filter(s=>s.trim()))await db.prepare(statement).run();
 }
 const base='https://example.test';
 async function api(path,{data,token,ip='203.0.113.7'}={}){
  const response=await mf.dispatchFetch(base+path,{method:data?'POST':'GET',headers:{origin:base,'content-type':'application/json','cf-connecting-ip':ip,...(token?{'x-room-admin-token':token}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return {status:response.status,body:await response.json()};
 }
 // Reject malformed payloads without creating rooms or storing unsafe text.
 assert.equal((await api('/api/rooms',{data:{title:'AB',maxEntries:2},ip:'203.0.113.50'})).status,400);
 assert.equal((await api('/api/rooms',{data:{title:'Turma <script>',maxEntries:2},ip:'203.0.113.51'})).status,400);
 assert.equal((await api('/api/rooms',{data:{title:'Sala',maxEntries:101},ip:'203.0.113.52'})).status,400);
 const created=await api('/api/rooms',{data:{title:'Turma de Direito',maxEntries:2,drawMode:'live'}});
 assert.equal(created.status,201);const {id,adminToken}=created.body;
 assert.equal(created.body.drawMode,'live');
 assert.match(id,/^[a-f0-9]{32}$/);assert.match(adminToken,/^[a-f0-9]{64}$/);
 assert.equal((await api('/api/rooms/'+id+'/join',{data:{name:'<img src=x>'},ip:'203.0.113.60'})).status,400);
 assert.equal((await api('/api/rooms/'+id+'/join',{data:{name:'A'},ip:'203.0.113.61'})).status,400);
 assert.equal((await api('/api/rooms/'+id+'/join',{data:{name:' Ana  Silva '}})).status,201);
 assert.equal((await api('/api/rooms/'+id+'/join',{data:{name:'ana silva'}})).status,409);
 assert.equal((await api('/api/rooms/'+id+'/join',{data:{name:'Bruno'}})).status,201);
 assert.equal((await api('/api/rooms/'+id+'/join',{data:{name:'Carla'}})).status,409);
 const room=await api('/api/rooms/'+id);assert.equal(room.status,200);
 assert.deepEqual(room.body.entries,['Ana Silva','Bruno']);assert.equal(room.body.adminToken,undefined);
 assert.equal((await api('/api/rooms/'+id+'/close',{data:{},token:'0'.repeat(64)})).status,403);
 assert.equal((await api('/api/rooms/'+id+'/draw',{data:{},token:adminToken})).status,409,'draw requires closed registrations');
 assert.equal((await api('/api/rooms/'+id+'/close',{data:{},token:adminToken})).status,200);
 assert.equal((await api('/api/rooms/'+id+'/join',{data:{name:'Davi'}})).status,409);
 assert.equal((await api('/api/rooms/'+id+'/draw',{data:{},token:'0'.repeat(64)})).status,403);
 const firstDraw=await api('/api/rooms/'+id+'/draw',{data:{},token:adminToken});
 assert.equal(firstDraw.status,201);
 assert.ok(['Ana Silva','Bruno'].includes(firstDraw.body.winner));
 assert.equal(firstDraw.body.round,1);
 const secondDraw=await api('/api/rooms/'+id+'/draw',{data:{},token:adminToken});
 assert.equal(secondDraw.status,201);
 assert.notEqual(secondDraw.body.winner,firstDraw.body.winner);
 assert.equal(secondDraw.body.round,2);
 assert.equal((await api('/api/rooms/'+id+'/draw',{data:{},token:adminToken})).status,409);
 const drawn=await api('/api/rooms/'+id);
 assert.deepEqual(drawn.body.draws.map(x=>x.round),[1,2]);
 assert.deepEqual(new Set(drawn.body.draws.map(x=>x.winner)),new Set(['Ana Silva','Bruno']));
 // Concurrent registrations must not exceed room capacity, even when submitted together.
 const classic=await api('/api/rooms',{data:{title:'Sorteio privado',maxEntries:2},ip:'203.0.113.80'});
 assert.equal(classic.status,201);assert.equal(classic.body.drawMode,'classic');
 assert.equal((await api('/api/rooms/'+classic.body.id)).body.drawMode,'classic');
 assert.equal((await api('/api/rooms/'+classic.body.id+'/join',{data:{name:'Pessoa privada'},ip:'203.0.113.81'})).status,201);
 assert.equal((await api('/api/rooms/'+classic.body.id+'/close',{data:{},token:classic.body.adminToken,ip:'203.0.113.82'})).status,200);
 assert.equal((await api('/api/rooms/'+classic.body.id+'/draw',{data:{},token:classic.body.adminToken,ip:'203.0.113.83'})).status,409);
 assert.deepEqual((await api('/api/rooms/'+classic.body.id)).body.draws,[]);
 assert.equal((await api('/api/rooms',{data:{title:'Modo inválido',maxEntries:2,drawMode:'unknown'},ip:'203.0.113.84'})).status,400);
 const concurrent=await api('/api/rooms',{data:{title:'Sala simultânea',maxEntries:2},ip:'203.0.113.8'});
 assert.equal(concurrent.status,201);
 const attempts=await Promise.all(Array.from({length:8},(_,i)=>api('/api/rooms/'+concurrent.body.id+'/join',{data:{name:'Pessoa '+i},ip:'203.0.113.'+(20+i)})));
 assert.equal(attempts.filter(x=>x.status===201).length,2);
 assert.equal(attempts.filter(x=>x.status===409).length,6);
 const concurrentState=await api('/api/rooms/'+concurrent.body.id);
 assert.equal(concurrentState.body.entries.length,2);
 for(let i=0;i<4;i++)assert.equal((await api('/api/rooms',{data:{title:'Sala '+i,maxEntries:2}})).status,201);
 assert.equal((await api('/api/rooms',{data:{title:'Sala extra',maxEntries:2}})).status,429);
 // An expired room must refuse new entries even before the daily cleanup runs.
 await db.prepare('UPDATE draw_rooms SET expires_at=? WHERE id=?').bind(Date.now()-1,concurrent.body.id).run();
 assert.equal((await api('/api/rooms/'+concurrent.body.id+'/join',{data:{name:'Pessoa tardia'},ip:'203.0.113.70'})).status,409);
 const expiredRoom=await api('/api/rooms/'+concurrent.body.id);
 assert.equal(expiredRoom.body.status,'closed');
 assert.deepEqual(expiredRoom.body.entries,[],'expired rooms must not expose names before cleanup');
 await db.prepare('UPDATE draw_rooms SET expires_at=? WHERE id=?').bind(Date.now()-1,id).run();
 // Cleanup must preserve active rate-limit buckets while deleting expired ones.
 const now=Date.now();
 await db.prepare('INSERT INTO draw_room_rate_limits(key,hits,expires_at) VALUES(?,?,?)').bind('qa-expired',3,now-1000).run();
 await db.prepare('INSERT INTO draw_room_rate_limits(key,hits,expires_at) VALUES(?,?,?)').bind('qa-active',2,now+3600000).run();
 // Scheduled cleanup runs against the same isolated DB, using Worker scheduled handler.
 const worker=(await import('../src/worker.js')).default;
 await worker.scheduled({}, {DB:db});
 assert.equal((await api('/api/rooms/'+id)).status,404);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM draw_room_entries WHERE room_id=?').bind(id).first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM draw_room_events WHERE room_id=?').bind(id).first()).n,0);
 assert.equal(await db.prepare('SELECT key FROM draw_room_rate_limits WHERE key=?').bind('qa-expired').first(),null);
 assert.equal((await db.prepare('SELECT key FROM draw_room_rate_limits WHERE key=?').bind('qa-active').first()).key,'qa-active');
 // Cleanup is repeatable and must preserve non-expired rooms and their entries.
 const activeRoom=await api('/api/rooms/'+room.body.id);
 assert.equal(activeRoom.status,404,'the expired room is gone');
 const live=await api('/api/rooms',{data:{title:'Sala preservada',maxEntries:2},ip:'203.0.113.91'});
 assert.equal(live.status,201);
 assert.equal((await api('/api/rooms/'+live.body.id+'/join',{data:{name:'Pessoa viva'},ip:'203.0.113.92'})).status,201);
 await worker.scheduled({}, {DB:db});
 await worker.scheduled({}, {DB:db});
 const surviving=await api('/api/rooms/'+live.body.id);
 assert.equal(surviving.status,200);
 assert.deepEqual(surviving.body.entries,['Pessoa viva']);

});

// Preview mode must not expose account, subscription, or payment endpoints.
test('rooms-only preview rejects non-room APIs before accessing D1 or billing',async t=>{
 const worker=(await import('../src/worker.js')).default;
 const env={PREVIEW_ROOMS_ONLY:'true'};
 for(const path of ['/api/me','/api/login','/api/register','/api/billing','/api/webhooks/mercadopago','/api/lists','/api/rooms/invalid/join']){
  const response=await worker.fetch(new Request('https://preview.example'+path),env);
  assert.equal(response.status,404,path);
  assert.equal((await response.json()).error,'Rota indisponível no ambiente de prévia');
 }
 const response=await worker.fetch(new Request('https://preview.example/api/rooms'),env);
 assert.notEqual(response.status,404,'room endpoint remains reachable in preview mode');
});
