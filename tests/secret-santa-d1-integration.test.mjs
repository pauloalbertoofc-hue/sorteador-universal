import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('secret santa: D1 event, individual reveals, invalid/expired tokens and isolation', { timeout: 20000 }, async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'secret-santa-d1',
    modules: [
      { type: 'ESModule', path: 'src/worker.js' },
      { type: 'ESModule', path: 'src/billing.js' },
      { type: 'ESModule', path: 'src/secret-santa.js' },
      { type: 'ESModule', path: 'public/amigo-secreto/engine.mjs' }
    ],
    compatibilityDate: '2026-10-24',
    d1Databases: ['DB']
  }));
  t.after(() => mf.dispose());
  await mf.ready;
  const db = await mf.getD1Database('DB');
  for (const file of ['migrations/0004_room_rate_limits.sql', 'migrations/20261115_secret_santa_private_storage.sql']) {
    const sql = (await readFile(file, 'utf8')).replace(/^--.*$/gm, '');
    for (const statement of sql.split(';').filter(Boolean)) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }
  let counter = 0;
  async function api(path, body, origin = 'https://example.test') {
    const response = await mf.dispatchFetch('https://example.test' + path, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.' + (++counter) },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }
  const created = await api('/api/secret-santa/events', { title: 'Amigos', participants: ['Ana', 'Bruno', 'Carla'] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.participants.length, 3);
  const id = created.body.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const rows = await db.prepare('SELECT display_name, access_token_hash, recipient_id FROM secret_santa_participants WHERE event_id=?').bind(id).all();
  assert.equal(rows.results.length, 3);
  const recipients = new Set();
  for (const participant of created.body.participants) {
    assert.match(participant.accessToken, /^[0-9a-f]{64}$/);
    assert.ok(rows.results.some(row => row.display_name === participant.name && row.access_token_hash !== participant.accessToken));
    const reveal = await api('/api/secret-santa/events/' + id + '/reveal', { accessToken: participant.accessToken });
    assert.equal(reveal.status, 200, JSON.stringify(reveal.body));
    assert.equal(reveal.body.giver, participant.name);
    assert.notEqual(reveal.body.recipient, participant.name);
    assert.ok(['Ana', 'Bruno', 'Carla'].includes(reveal.body.recipient));
    assert.deepEqual(Object.keys(reveal.body).sort(), ['expiresAt', 'giver', 'recipient', 'title']);
    recipients.add(reveal.body.recipient);
  }
  assert.equal(recipients.size, 3);
  assert.equal((await api('/api/secret-santa/events/' + id + '/reveal', { accessToken: '0'.repeat(64) })).status, 404);
  assert.equal((await api('/api/secret-santa/events/' + id + '/reveal', { accessToken: 'invalid' })).status, 403);
  assert.equal((await api('/api/secret-santa/events', { title: 'Amigos', participants: ['Ana', 'Bruno'] }, 'https://evil.example')).status, 403);
  await db.prepare('UPDATE secret_santa_events SET expires_at=? WHERE id=?').bind(Date.now()-1,id).run();
  assert.equal((await api('/api/secret-santa/events/' + id + '/reveal', { accessToken: created.body.participants[0].accessToken })).status, 404);
});
