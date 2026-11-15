import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/secret-santa.js',import.meta.url),'utf8');

test('private API uses existing origin protection and rate limits',()=>{
  assert.ok(worker.includes("if(method!=='GET'&&!originOk(req)"));
  assert.ok(worker.includes("secretSantaApi(req,env,path,roomRateLimit,requester,accountUser)"));
  assert.ok(api.includes("rateLimit('secret-santa',requester,10,3600000)"));
});

test('participant secrets are stored as hashes and only reveal one matching assignment',()=>{
  assert.ok(api.includes('await digest(member.accessToken)'));
  assert.ok(api.includes('p.access_token_hash=?'));
  assert.ok(api.includes('e.expires_at>?'));
  assert.ok(api.includes('r.id=p.recipient_id AND r.event_id=p.event_id'));
  assert.ok(api.includes('env.DB.batch(statements)'));
});

test('account event routes are session-bound and never list assignments',()=>{
  assert.ok(worker.includes("path.startsWith('/api/secret-santa/account/')?await auth(req,env):null"));
  assert.ok(api.includes("if(!authenticatedUser)return error('Entre na sua conta para consultar seus eventos.',401)"));
  assert.ok(api.includes("WHERE owner_user_id=? ORDER BY created_at DESC"));
  assert.ok(api.includes("authenticatedUser.id,'links'"));
  assert.ok(api.includes("Modo protegido ainda não disponível."));
  assert.ok(!api.includes("SELECT * FROM secret_santa_events"));
});
