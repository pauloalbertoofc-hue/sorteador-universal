import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {unstable_readConfig} from 'wrangler';

const productionId = '24fe67dc-7003-4557-9de0-cf6658e713c2';
const previewId = '9701cfcf-9c77-4b09-8411-0f4a13f8c584';

test('Wrangler validates distinct production and Workers Previews D1 bindings', () => {
  const config = unstable_readConfig({config: 'wrangler.jsonc'});
  // Production billing is configured via Cloudflare environment variables; keep_vars preserves them.
  assert.equal(config.vars.BILLING_ENABLED, undefined);
  assert.equal(config.previews.vars.BILLING_ENABLED, 'false');
  assert.deepEqual(config.d1_databases, [{binding: 'DB', database_name: 'sorteador-universal-db', database_id: productionId}]);
  assert.equal(config.previews.d1_databases.length, 1);
  const preview = config.previews.d1_databases[0];
  assert.equal(preview.binding, 'DB');
  assert.equal(preview.database_name, 'sorteador-universal-preview-db');
  assert.equal(preview.database_id, previewId);
  assert.equal(preview.migrations_dir, 'migrations/preview');
  assert.ok(!JSON.stringify(config.previews).includes(productionId));
  assert.ok(!JSON.stringify(config.previews).includes('<REPLACE_ME>'));
  for (const key of ['MP_ACCESS_TOKEN', 'MP_PLAN_ID', 'MP_WEBHOOK_SECRET', 'PUBLIC_SITE_URL']) assert.equal(config.previews.vars[key], undefined);
});

test('preview migration CLI config contains only preview DB and dedicated SQL directory', async () => {
  const config = unstable_readConfig({config: 'wrangler.preview-db.jsonc'});
  assert.equal(config.d1_databases.length, 1);
  assert.equal(config.d1_databases[0].database_id, previewId);
  assert.equal(config.d1_databases[0].migrations_dir, 'migrations/preview');
  const text = await readFile('wrangler.preview-db.jsonc', 'utf8');
  assert.ok(!text.includes(productionId));
  const {scripts, devDependencies} = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(devDependencies.wrangler, '4.152.0');
  assert.match(scripts['db:preview:remote'], /--remote --config wrangler\.preview-db\.jsonc$/);
});

test('preview bootstrap is repeatable, creates five empty tables and enforces auth relationships', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-10-24', d1Databases: ['DB']
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const sql = (await readFile('migrations/preview/0001_initial.sql', 'utf8')).replace(/^--.*$/gm, '');
  for (let i = 0; i < 2; i++) {
    for (const statement of sql.split(';').filter(s => s.trim())) await db.prepare(statement).run();
  }
  for (const table of ['users', 'sessions', 'subscriptions', 'saved_lists', 'payment_events']) {
    assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 0);
  }
  await assert.rejects(db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind('hash', 'missing-user', Date.now()).run(), /FOREIGN KEY/);
  await db.prepare('INSERT INTO users(id,email,password_hash) VALUES(?,?,?)').bind('test-user', 'fixture@example.test', 'fixture').run();
  await db.prepare('INSERT INTO subscriptions(id,user_id) VALUES(?,?)').bind('test-sub', 'test-user').run();
  assert.equal((await db.prepare('SELECT status FROM subscriptions').first()).status, 'inactive');
  await assert.rejects(db.prepare('INSERT INTO subscriptions(id,user_id) VALUES(?,?)').bind('other-sub', 'test-user').run(), /UNIQUE/);
  const index = await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sessions_expiry'").first();
  assert.ok(index);
});

test('room migrations are mirrored into preview and retain the same schema',async()=>{
 for(const name of ['0003_public_rooms.sql','0004_room_rate_limits.sql']){
  const [prod,preview]=await Promise.all([readFile('migrations/'+name,'utf8'),readFile('migrations/preview/'+name,'utf8')]);
  assert.equal(preview,prod,'preview schema differs for '+name);
 }
});

test('full preview migration chain provisions rooms alongside existing auth and billing tables',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-24',d1Databases:['DB']}));
 t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 for(const file of ['0001_initial.sql','0002_billing_safety.sql','0003_public_rooms.sql','0004_room_rate_limits.sql']){
  const sql=(await readFile('migrations/preview/'+file,'utf8')).replace(/^--.*$/gm,'');
  for(const statement of sql.split(';').filter(x=>x.trim()))await db.prepare(statement).run();
 }
 for(const table of ['users','sessions','subscriptions','saved_lists','payment_events','billing_locks','billing_checkout','billing_events','draw_rooms','draw_room_entries','draw_room_rate_limits']){
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n,0,table);
 }
});
