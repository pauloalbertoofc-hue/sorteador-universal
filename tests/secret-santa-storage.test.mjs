import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../migrations/20261115_secret_santa_private_storage.sql', import.meta.url), 'utf8');

test('secret santa storage isolates events and participant access', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS secret_santa_events/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS secret_santa_participants/);
  assert.match(sql, /admin_token_hash TEXT NOT NULL/);
  assert.match(sql, /access_token_hash TEXT NOT NULL UNIQUE/);
  assert.match(sql, /UNIQUE\\(event_id, name_key\\)/);
  assert.match(sql, /recipient_id TEXT REFERENCES secret_santa_participants\\(id\\)/);
  assert.match(sql, /CHECK\\(recipient_id IS NULL OR recipient_id <> id\\)/);
  assert.doesNotMatch(sql, /access_token TEXT|admin_token TEXT/);
});
