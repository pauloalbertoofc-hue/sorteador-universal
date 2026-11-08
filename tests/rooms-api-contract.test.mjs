import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const schema=readFileSync(new URL('../migrations/0003_public_rooms.sql',import.meta.url),'utf8');
const limits=readFileSync(new URL('../migrations/0004_room_rate_limits.sql',import.meta.url),'utf8');
const config=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
test('v2.5 room schema and API agree on required tables',()=>{
 for(const name of ['draw_rooms','draw_room_entries']){
  assert.match(schema,new RegExp('CREATE TABLE IF NOT EXISTS '+name));
  assert.match(worker,new RegExp(name));
 }
 assert.match(limits,/CREATE TABLE IF NOT EXISTS draw_room_rate_limits/);
 assert.match(worker,/roomRateLimit\('create',requester,5,3600000\)/);
 assert.match(worker,/roomRateLimit\('join',requester,30,3600000\)/);
 assert.match(worker,/roomRateLimit\('close',requester,20,3600000\)/);
});
test('v2.5 room capacity is enforced atomically and invitation does not contain owner secret',()=>{
 assert.match(worker,/INSERT OR IGNORE INTO draw_room_entries/);
 assert.match(worker,/SELECT COUNT\(\*\) FROM draw_room_entries/);
 assert.match(worker,/UNIQUE\(room_id,name_key\)/);
 assert.match(worker,/return json\(\{id:room.id,title:room.title,status:/);
 assert.doesNotMatch(worker,/return json\(\{id:room.id,title:room.title,adminToken/);
});
test('v2.5 cleanup is scheduled and removes expired room records',()=>{
 assert.match(config,/"crons": \["17 3 \* \* \*"\]/);
 assert.match(worker,/async scheduled\(_event,env\)/);
 assert.match(worker,/DELETE FROM draw_room_entries WHERE room_id IN/);
 assert.match(worker,/DELETE FROM draw_rooms WHERE expires_at<=\?/);
 assert.match(worker,/DELETE FROM draw_room_rate_limits WHERE expires_at<=\?/);
});
