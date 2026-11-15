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
  assert.ok(api.includes("authenticatedUser.id,mode)"));
  assert.ok(api.includes("if(mode!=='links')return error("));
  assert.ok(!api.includes("SELECT * FROM secret_santa_events"));
});

test('protected guest flow requires high-entropy code, atomic redemption and scoped session',()=>{
 assert.ok(api.includes("body.mode||'links'"));
 assert.ok(api.includes("mode==='protected'?token():null"));
 assert.ok(api.includes("credential_hash,expires_at,created_at"));
 assert.ok(api.includes("UPDATE secret_santa_guest_credentials SET redeemed_at=?"));
 assert.ok(api.includes("AND redeemed_at IS NULL AND revoked_at IS NULL RETURNING id"));
 assert.ok(api.includes("secret_santa_guest_sessions(token_hash,event_id,participant_id"));
 assert.ok(api.includes("s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?"));
 assert.ok(api.includes("e.distribution_mode='protected'"));
 assert.ok(api.includes("rateLimit('secret-santa-join',requester,12,3600000)"));
});

test('new draft lifecycle separates privacy from participant entry and discloses supervision',()=>{
 assert.ok(api.includes("path==='/api/secret-santa/account/drafts'"));
 assert.ok(api.includes("privacy!=='private'&&privacy!=='supervised'"));
 assert.ok(api.includes("VALUES(?,?,?,'draft'"));
 assert.ok(api.includes("invite_token_hash"));
 assert.ok(api.includes("invite-info"));
 assert.ok(api.includes("organizerCanViewResults:event.privacy_mode==='supervised'"));
 assert.ok(api.includes("if(!authenticatedUser)return error('Entre na sua conta para organizar o sorteio.',401)"));
});

test('shared invitation enrollment refuses duplicate accounts and closed registration races',()=>{
 assert.ok(api.includes("path.match(/^\\/api\\/secret-santa\\/events"));
 assert.ok(api.includes("if(kind==='account'&&!authenticatedUser)"));
 assert.ok(api.includes("WHERE event_id=? AND user_id=? LIMIT 1"));
 assert.ok(api.includes("inserted.meta?.changes!==1"));
 assert.ok(api.includes("claim_token_hash"));
});
