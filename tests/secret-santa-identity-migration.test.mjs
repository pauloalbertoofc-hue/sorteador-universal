import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('0008 preserves legacy Secret Santa and adds isolated identity storage', async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({
  name:'secret-santa-identity-migration-test',
  modules:[{type:'ESModule',path:'src/worker.js'},{type:'ESModule',path:'src/billing.js'},{type:'ESModule',path:'src/secret-santa.js'},{type:'ESModule',path:'public/amigo-secreto/engine.mjs'}],
  compatibilityDate:'2026-10-24',d1Databases:['DB']
 }));
 t.after(()=>mf.dispose());
 await mf.ready;
 const db=await mf.getD1Database('DB');
 const apply=async path=>{
  const sql=(await readFile(path,'utf8')).replace(/^--.*$/gm,'');
  for(const statement of sql.split(';').filter(s=>s.trim()))await db.prepare(statement).run();
 };
 await db.prepare('CREATE TABLE users (id TEXT PRIMARY KEY)').run();
 await apply('migrations/0007_secret_santa_private_storage.sql');
 await db.prepare("INSERT INTO secret_santa_events(id,title,admin_token_hash,status,created_at,expires_at) VALUES('legacy','Legacy event','hash','drawn',100,200)").run();
 await apply('migrations/0008_secret_santa_identity.sql');
 const event=await db.prepare("SELECT id,owner_user_id,distribution_mode FROM secret_santa_events WHERE id='legacy'").first();
 assert.deepEqual(event,{id:'legacy',owner_user_id:null,distribution_mode:'links'});
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(x=>x.name);
 assert.ok(tables.includes('secret_santa_guest_credentials'));
 assert.ok(tables.includes('secret_santa_guest_sessions'));
 await assert.rejects(db.prepare("UPDATE secret_santa_events SET distribution_mode='invalid' WHERE id='legacy'").run(),/CHECK constraint/i);
 await assert.rejects(db.prepare("UPDATE secret_santa_events SET owner_user_id='missing' WHERE id='legacy'").run(),/FOREIGN KEY/i);
});
