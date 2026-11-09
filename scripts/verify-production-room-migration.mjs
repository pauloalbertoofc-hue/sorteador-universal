import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// READ-ONLY local release gate. Never connects to Cloudflare or applies migrations.
const prod=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const preview=JSON.parse(readFileSync('wrangler.preview-db.jsonc','utf8'));
assert.equal(prod.name,'sorteador-universal');
assert.equal(prod.d1_databases?.length,1);
assert.equal(prod.d1_databases[0].database_id,'24fe67dc-7003-4557-9de0-cf6658e713c2');
assert.equal(preview.d1_databases?.length,1);
assert.equal(preview.d1_databases[0].database_id,'9701cfcf-9c77-4b09-8411-0f4a13f8c584');
assert.notEqual(prod.d1_databases[0].database_id,preview.d1_databases[0].database_id);
for(const filename of ['0003_public_rooms.sql','0004_room_rate_limits.sql','0005_room_live_draw.sql']){
 const a=readFileSync('migrations/'+filename,'utf8');
 const b=readFileSync('migrations/preview/'+filename,'utf8');
 assert.equal(a,b,filename+' differs between preview and production');
 assert.match(a,/CREATE TABLE IF NOT EXISTS/);
 const statements=a.replace(/--[^\n]*/g,'').split(';').map(x=>x.trim()).filter(Boolean);
 assert.ok(statements.length>0,'empty migration');
 for(const statement of statements){
  assert.match(statement,/^CREATE\s+(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\b/i,'only additive CREATE TABLE/INDEX statements are allowed');
  assert.doesNotMatch(statement,/\b(?:DROP|TRUNCATE|ALTER|UPDATE|INSERT|REPLACE|PRAGMA|ATTACH|DETACH)\b/i);
  assert.doesNotMatch(statement,/\bDELETE\s+FROM\b/i);
 }
}
assert.ok(prod.triggers?.crons?.includes('17 3 * * *'),'production cleanup cron must be configured');
console.log('Read-only production migration preflight passed: IDs distinct, schemas identical, non-destructive migration SQL, cron declared.');
console.log('This check does NOT verify production D1 state and does NOT authorize or perform deployment.');
