import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const prod=readFileSync(new URL('../migrations/0007_secret_santa_private_storage.sql',import.meta.url),'utf8');
const preview=readFileSync(new URL('../migrations/preview/0007_secret_santa_private_storage.sql',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/production-rooms-deploy.yml',import.meta.url),'utf8');
test('preview and production use the same Secret Santa schema',()=>{
  assert.equal(prod,preview);
  assert.match(prod,/CREATE TABLE IF NOT EXISTS secret_santa_events/);
  assert.match(prod,/CREATE TABLE IF NOT EXISTS secret_santa_participants/);
});
test('production deployment refuses missing Secret Santa schema',()=>{
  assert.match(workflow,/Require Secret Santa tables and recorded migration before deploy/);
  assert.match(workflow,/secret_santa_events/);
  assert.match(workflow,/secret_santa_participants/);
  assert.match(workflow,/0007_secret_santa_private_storage\.sql/);
  assert.match(workflow,/production deployment blocked/);
});
