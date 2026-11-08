import {test, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID, createHmac} from 'node:crypto';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';

const PLAN = 'a'.repeat(32), ORIGIN = 'https://sorteador.example.test', SECRET = 'synthetic-webhook-secret';
const schedule = () => ({frequency: 1, frequency_type: 'months', currency_id: 'BRL', transaction_amount: 4.9});
let mf, db, user, cookie, subs, charges, payments, created, fail, ambiguous, delay, planOverride, gate, clock, cancellations, paymentUnavailable, credentials;
const response = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
async function provider(req) {
  const u = new URL(req.url);
  assert.equal(u.origin, 'https://api.mercadopago.com'); // No unexpected real network access.
  if (fail) return response({}, 503);
  if (u.pathname === '/users/me') return response({id: 123});
  if (u.pathname === '/preapproval_plan/' + PLAN) return response({id: PLAN, collector_id: 123, status: 'active', auto_recurring: schedule(), ...planOverride});
  if (u.pathname === '/preapproval/' && req.method === 'POST') {
    created++;
    if (gate) await gate();
    if (delay) await new Promise(resolve => setTimeout(resolve, 100));
    const body = await req.json(), id = randomUUID().replaceAll('-', '');
    assert.equal(body.status, 'pending'); assert.equal(body.preapproval_plan_id, undefined); assert.deepEqual(body.auto_recurring, schedule());
    assert.equal(body.back_url, ORIGIN + '/?billing=return');
    assert.ok(req.headers.get('x-idempotency-key'));
    const sub = {id, status: 'pending', external_reference: body.external_reference, payer_email: body.payer_email, collector_id: 123, payer_id: 456, preapproval_plan_id: null, auto_recurring: schedule(), init_point: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${id}`};
    subs.set(id, sub);
    return ambiguous ? response({}, 503) : response(sub);
  }
  if (u.pathname === '/preapproval/search') return response({paging: {total: subs.size}, results: [...subs.values()].slice(Number(u.searchParams.get('offset')), Number(u.searchParams.get('offset')) + 100)});
  if (u.pathname.startsWith('/preapproval/')) {
    const sub = subs.get(u.pathname.split('/').at(-1));
    if (!sub) return response({}, 404);
    if (req.method === 'PUT') {cancellations++; assert.deepEqual(await req.json(), {status: 'cancelled'}); sub.status = 'cancelled';}
    return response(sub);
  }
  if (u.pathname === '/authorized_payments/search') {
    if(paymentUnavailable)return response({},503);
    const results = charges.filter(c => c.preapproval_id === u.searchParams.get('preapproval_id'));
    return response({paging: {total: results.length}, results: results.slice(Number(u.searchParams.get('offset')), Number(u.searchParams.get('offset')) + 100)});
  }
  if (u.pathname.startsWith('/authorized_payments/')) return response(charges.find(c => String(c.id) === u.pathname.split('/').at(-1)) || {});
  if (u.pathname.startsWith('/v1/payments/')) return response(payments.get(u.pathname.split('/').at(-1)) || {});
  throw Error(`Unexpected provider route: ${req.method} ${u.pathname}`);
}
async function request(path, body, headers = {}) {
  return mf.dispatchFetch(ORIGIN + path, {method: body ? 'POST' : 'GET', headers: {cookie, 'x-test-clock': String(clock), origin: ORIGIN, 'content-type': 'application/json', ...headers}, ...(body ? {body: JSON.stringify(body)} : {})});
}
async function signIn(){const r=await request('/api/login',credentials);assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];}
async function start() {
  const r = await request('/api/checkout', {}); assert.equal(r.status, 200, await r.clone().text());
  const id = new URL((await r.json()).checkout_url).searchParams.get('preapproval_id'); return subs.get(id);
}
function approve(sub, {paymentStatus = 'approved', debit = clock - 1000, refund = 0} = {}) {
  sub.status = 'authorized';
  const id = String(payments.size + 1000);
  payments.set(id, {id: Number(id), status: paymentStatus, collector_id: 123, payer: {id: 456}, currency_id: 'BRL', transaction_amount: 4.9, transaction_amount_refunded: refund, date_approved: new Date(debit).toISOString(), external_reference: user.id});
  charges.push({id: String(charges.length + 3000), preapproval_id: sub.id, status: 'processed', debit_date: new Date(debit).toISOString(), payment: {id: Number(id), status: paymentStatus}});
  return payments.get(id);
}
async function event(sub, options = {}) {
  const resource = options.id || sub.id, ts = options.ts || String(clock), rid = options.rid || randomUUID();
  const sig = createHmac('sha256', SECRET).update(`id:${resource.toLowerCase()};request-id:${rid};ts:${ts};`).digest('hex');
  const headers = {'x-request-id': rid, 'x-signature': `ts=${ts},v1=${options.bad ? 'f'.repeat(64) : sig}`};
  const body = {type: options.type || 'subscription_preapproval', data: {id: resource}, ...(options.body || {})};
  return {path: `/api/webhooks/mercadopago?data.id=${resource}`, body, headers};
}
async function send(evt) {return request(evt.path, evt.body, evt.headers);}
async function me() {const r = await request('/api/me'); assert.equal(r.status, 200); return r.json();}

before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({name: 'planless-billing-tests',
    modules: [{type: 'ESModule', path: 'tests/fixtures/clock-worker.js'}, {type: 'ESModule', path: 'src/worker.js'}, {type: 'ESModule', path: 'src/billing.js'}, {type: 'ESModule', path: 'src/mp-subscription-contract.js'}, {type: 'ESModule', path: 'src/mp-planless-response.js'}],
    compatibilityDate: '2026-10-24', d1Databases: ['DB'], outboundService: provider,
    bindings: {BILLING_ENABLED: 'true', BILLING_MODE: 'public', MP_ACCESS_TOKEN: 'synthetic-test-token', MP_PLAN_ID: PLAN, MP_PLANLESS_CHECKOUT: 'true', MP_WEBHOOK_SECRET: SECRET, PUBLIC_SITE_URL: ORIGIN}
  }));
  await mf.ready; db = await mf.getD1Database('DB');
  for (const file of ['migrations/preview/0001_initial.sql', 'migrations/preview/0002_billing_safety.sql']) {
    const sql = (await readFile(file, 'utf8')).replace(/^--.*$/gm, '');
    for (const statement of sql.split(';').filter(s => s.trim())) await db.prepare(statement).run();
  }
});
after(async () => mf?.dispose());
beforeEach(async () => {
  subs = new Map(); charges = []; payments = new Map(); created = 0; fail = false; ambiguous = false; delay = false; planOverride = {}; gate = null; clock = Date.parse('2026-01-15T12:00:00.000Z'); cancellations = 0; paymentUnavailable = false;
  credentials={email: `${randomUUID()}@example.test`,password:randomUUID()};
  const r = await mf.dispatchFetch(ORIGIN + '/api/register', {method: 'POST', headers: {origin: ORIGIN, 'x-test-clock': String(clock), 'content-type': 'application/json'}, body: JSON.stringify(credentials)});
  assert.equal(r.status, 201); cookie = r.headers.get('set-cookie').split(';')[0];
  user = (await me()).user;
});


test('planless checkout persists no plan and reuses the pending subscription', async () => {
  const sub = await start();
  assert.equal(sub.preapproval_plan_id, null);
  assert.equal((await db.prepare('SELECT mp_plan_id FROM subscriptions WHERE user_id=?').bind(user.id).first()).mp_plan_id, null);
  await start(); assert.equal(created, 1);
  assert.equal((await me()).subscription.status, 'pending');
});
test('ambiguous planless POST recovers once and never starts a second charge', async () => {
  ambiguous = true;
  assert.equal((await request('/api/checkout', {})).status, 502);
  ambiguous = false;
  await start(); assert.equal(created, 1);
});
test('unresolved ambiguous planless POST remains blocked', async () => {
  ambiguous = true;
  assert.equal((await request('/api/checkout', {})).status, 502);
  subs.clear(); ambiguous = false;
  assert.equal((await request('/api/checkout', {})).status, 409);
  assert.equal(created, 1);
});
test('planless paid period survives cancellation and signed webhook reconciliation', async () => {
  const sub = await start(); approve(sub);
  assert.equal((await me()).subscription.active, true);
  assert.equal((await send(await event(sub))).status, 200);
  const cancelled = await request('/api/subscription/cancel', {});
  assert.equal(cancelled.status, 200, await cancelled.clone().text());
  const state = (await cancelled.json()).subscription;
  assert.equal(state.active, true);
  assert.equal(state.renewal_status, 'cancelled');
  assert.equal(cancellations, 1);
  assert.equal((await me()).subscription.access_status, 'pro_cancelled');
  assert.equal((await send(await event(sub))).status, 200);
  assert.equal((await db.prepare('SELECT mp_plan_id,status FROM subscriptions WHERE user_id=?').bind(user.id).first()).mp_plan_id, null);
});
test('planless provider contract drift fails closed', async () => {
  const sub = await start(); approve(sub);
  sub.preapproval_plan_id = PLAN;
  assert.equal((await me()).subscription.active, false);
  assert.equal((await request('/api/subscription/cancel', {})).status, 502);
  assert.equal(cancellations, 0);
});
