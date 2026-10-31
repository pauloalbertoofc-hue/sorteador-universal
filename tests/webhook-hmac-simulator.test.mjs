import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto, createHmac} from 'node:crypto';
import {webhook, BillingError} from '../src/billing.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const secret = 'local-test-secret-never-use-in-production';
const env = {
  MP_ACCESS_TOKEN: 'test-token',
  MP_WEBHOOK_SECRET: secret,
  MP_PLAN_ID: '0123456789abcdef0123456789abcdef',
  PUBLIC_SITE_URL: 'https://example.com/'
};

async function signedRequest({id = '123456', bodyId = id, type = 'unhandled_test_event', signingSecret = secret, signatureId = id} = {}) {
  const ts = String(Math.floor(Date.now() / 1000));
  const rid = 'simulator-request-123';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingSecret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`id:${signatureId.toLowerCase()};request-id:${rid};ts:${ts};`));
  const signature = Buffer.from(bytes).toString('hex');
  const url = new URL('https://example.com/api/webhooks/mercadopago');
  url.searchParams.set('data.id', id);
  url.searchParams.set('type', type);
  const req = new Request(url, {method: 'POST', headers: {'x-request-id': rid, 'x-signature': `ts=${ts},v1=${signature}`, 'content-type': 'application/json'}, body: JSON.stringify({type, data: {id: bodyId}})});
  return {req, url};
}

test('Mercado Pago simulator-shaped notification: valid HMAC is accepted', async () => {
  const {req, url} = await signedRequest();
  assert.deepEqual(await webhook(req, env, url), {ok: true, ignored: true});
});

test('incorrect webhook secret is rejected with 401', async () => {
  const {req, url} = await signedRequest({signingSecret: 'another-secret'});
  await assert.rejects(webhook(req, env, url), err => err instanceof BillingError && err.status === 401);
});

test('query data.id tampering invalidates HMAC', async () => {
  const {req, url} = await signedRequest({id: '123456', signatureId: '654321'});
  await assert.rejects(webhook(req, env, url), err => err instanceof BillingError && err.status === 401);
});

test('signed query ID must match body ID', async () => {
  const {req, url} = await signedRequest({bodyId: '654321'});
  await assert.rejects(webhook(req, env, url), err => err instanceof BillingError && err.status === 400);
});

test('independent Node crypto signature validates an uppercase resource ID', async () => {
  const id = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';
  const ts = String(Date.now());
  const rid = '2066ca19-c6f1-498a-be75-1923005edd06';
  const manifest = `id:${id.toLowerCase()};request-id:${rid};ts:${ts};`;
  const signature = createHmac('sha256', secret).update(manifest).digest('hex');
  const url = new URL('https://example.com/api/webhooks/mercadopago');
  url.searchParams.set('data.id', id);
  const req = new Request(url, {
    method: 'POST',
    headers: {'x-request-id': rid, 'x-signature': `ts=${ts},v1=${signature}`},
    body: JSON.stringify({type: 'unhandled_test_event', data: {id}})
  });
  assert.deepEqual(await webhook(req, env, url), {ok: true, ignored: true});
});

test('signed simulated subscription with missing provider resource is safely ignored', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Not found', {status: 404});
  try {
    const {req, url} = await signedRequest({type: 'subscription_preapproval'});
    const result = await webhook(req, {...env, DB: {prepare(sql) {assert.match(sql, /SELECT event_key FROM billing_events/); return {bind() {return {async first() {return null;}};}};}}}, url);
    assert.deepEqual(result, {ok: true, ignored: true});
  } finally {globalThis.fetch = originalFetch;}
});

test('provider errors other than 404 remain failures', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Provider unavailable', {status: 503});
  try {
    const {req, url} = await signedRequest({type: 'subscription_preapproval'});
    await assert.rejects(webhook(req, {...env, DB: {prepare(sql) {assert.match(sql, /SELECT event_key FROM billing_events/); return {bind() {return {async first() {return null;}};}};} }}, url), err => err instanceof BillingError && err.status === 502);
  } finally {globalThis.fetch = originalFetch;}
});
