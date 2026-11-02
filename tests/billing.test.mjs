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
    assert.equal(body.status, 'pending'); assert.equal(body.preapproval_plan_id, PLAN);
    assert.equal(body.back_url, ORIGIN + '/?billing=return');
    assert.ok(req.headers.get('x-idempotency-key'));
    const sub = {id, status: 'pending', external_reference: body.external_reference, payer_email: body.payer_email, collector_id: 123, payer_id: 456, preapproval_plan_id: PLAN, auto_recurring: schedule(), init_point: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${id}`};
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
  mf = new Miniflare(convertV4MiniflareOptions({name: 'billing-tests',
    modules: [{type: 'ESModule', path: 'tests/fixtures/clock-worker.js'}, {type: 'ESModule', path: 'src/worker.js'}, {type: 'ESModule', path: 'src/billing.js'}, {type: 'ESModule', path: 'src/mp-subscription-contract.js'}, {type: 'ESModule', path: 'src/mp-planless-response.js'}],
    compatibilityDate: '2026-10-24', d1Databases: ['DB'], outboundService: provider,
    bindings: {BILLING_ENABLED: 'true', BILLING_MODE: 'public', MP_ACCESS_TOKEN: 'synthetic-test-token', MP_PLAN_ID: PLAN, MP_WEBHOOK_SECRET: SECRET, PUBLIC_SITE_URL: ORIGIN}
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

test('free account stays free and billing is enabled only after canonical plan validation', async () => {
  let state = await me(); assert.equal(state.subscription.active, false); assert.equal(state.billing.configured, true);
  planOverride = {auto_recurring: {...schedule(), transaction_amount: 49}};
  state = await me(); assert.equal(state.billing.configured, false);
  assert.equal((await request('/api/checkout', {})).status, 503); assert.equal(created, 0);
});
test('checkout creates one pending subscription and reuses its hosted URL', async () => {
  const sub = await start(); await start(); assert.equal(created, 1);
  assert.equal((await me()).subscription.status, 'pending');
  assert.equal((await me()).subscription.active, false);
  assert.equal((await request('/api/lists')).status, 403);
  assert.equal(sub.external_reference, user.id);
});
test('concurrent checkouts are serialized with D1 and cannot create duplicate subscriptions', async () => {
  delay = true;
  const results = await Promise.all([request('/api/checkout', {}), request('/api/checkout', {}), request('/api/checkout', {})]);
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 2); assert.equal(created, 1);
});
test('ambiguous create response recovers canonical subscription without another POST', async () => {
  ambiguous = true; assert.equal((await request('/api/checkout', {})).status, 502);
  ambiguous = false; await start(); assert.equal(created, 1);
});
test('unresolved ambiguous create never blindly retries a potentially successful charge', async () => {
  fail = false; ambiguous = true; await request('/api/checkout', {});
  subs.clear(); ambiguous = false;
  assert.equal((await request('/api/checkout', {})).status, 409); assert.equal(created, 1);
});
test('authorized subscription without an approved linked payment never grants Pro', async () => {
  const sub = await start(); sub.status = 'authorized';
  assert.equal((await me()).subscription.active, false);
  assert.equal((await request('/api/lists')).status, 403);
});
test('approved charge validates amount, currency, seller, payer and current period before granting lists', async () => {
  const sub = await start(); approve(sub);
  assert.equal((await me()).subscription.active, true);
  assert.equal((await request('/api/lists', {name: 'Synthetic', items: ['A', 'B']})).status, 201);
  assert.equal((await request('/api/lists')).status, 200);
});
test('wrong user, plan, currency, amount and collector are rejected even if stored authorized', async () => {
  const sub = await start(); approve(sub); const original = structuredClone(sub);
  for (const patch of [{external_reference: randomUUID()}, {preapproval_plan_id: 'b'.repeat(32)}, {collector_id: 999}, {auto_recurring: {...schedule(), currency_id: 'USD'}}, {auto_recurring: {...schedule(), transaction_amount: 0.01}}]) {
    Object.assign(sub, original, patch);
    assert.equal((await me()).subscription.active, false);
    assert.equal((await request('/api/lists')).status, 403);
  }
});
test('rejected, refunded, expired and paused subscriptions revoke Pro', async () => {
  for (const kind of ['rejected', 'refunded', 'expired', 'paused']) {
    if (subs.size) {subs.clear(); charges = []; payments.clear(); await db.prepare('DELETE FROM subscriptions WHERE user_id=?').bind(user.id).run(); await db.prepare('DELETE FROM billing_checkout WHERE user_id=?').bind(user.id).run();}
    const sub = await start(); approve(sub, {paymentStatus: kind === 'rejected' ? 'rejected' : 'approved', refund: kind === 'refunded' ? 4.9 : 0, debit: kind === 'expired' ? clock - 40 * 86400000 : clock - 1000});
    if (['paused', 'cancelled'].includes(kind)) sub.status = kind;
    assert.equal((await me()).subscription.active, false, kind);
    assert.equal((await request('/api/lists')).status, 403, kind);
  }
});
test('provider failure never falls back to locally authorized for lists or account', async () => {
  const sub = await start(); approve(sub); assert.equal((await me()).subscription.active, true);
  fail = true; assert.equal((await me()).subscription.active, false); assert.equal((await request('/api/lists')).status, 403);
});
test('signed webhook reconciles canonical resources; duplicate deliveries are idempotent', async () => {
  const sub = await start(); approve(sub); const evt = await event(sub);
  assert.equal((await send(evt)).status, 200);
  assert.deepEqual(await (await send(evt)).json(), {ok: true, duplicate: true});
  const events = await db.prepare('SELECT COUNT(*) AS n FROM billing_events WHERE resource_id=?').bind(sub.id).first(); assert.equal(events.n, 1);
  assert.equal((await me()).subscription.active, true);
});
test('invalid signatures, stale timestamps and resource substitution are rejected', async () => {
  const sub = await start();
  assert.equal((await send(await event(sub, {bad: true}))).status, 401);
  assert.equal((await send(await event(sub, {ts: String(clock - 600000)}))).status, 401);
  const evt = await event(sub); evt.body.data.id = 'other'; assert.equal((await send(evt)).status, 400);
});
test('webhook rejects missing auth fields, stale timestamps and invalid HMAC without accepting events', async () => {
  const sub = await start();
  const unsigned = await request('/api/webhooks/mercadopago', {type: 'subscription_preapproval', data: {id: sub.id}});
  assert.equal(unsigned.status, 401);
  assert.deepEqual(await unsigned.json(), {error: 'Assinatura inválida.'});
  const missingRequestId = await event(sub);
  delete missingRequestId.headers['x-request-id'];
  assert.equal((await send(missingRequestId)).status, 401);
  const missingSignature = await event(sub);
  delete missingSignature.headers['x-signature'];
  assert.equal((await send(missingSignature)).status, 401);
  assert.equal((await send(await event(sub, {ts: String(clock - 600000)}))).status, 401);
  assert.equal((await send(await event(sub, {bad: true}))).status, 401);
  assert.equal((await send(await event(sub))).status, 200);
});

test('out-of-order notifications preserve cancelled renewal and only the verified paid period', async () => {
  const sub = await start(); approve(sub); const old = await event(sub, {body: {status: 'authorized'}});
  sub.status = 'cancelled'; assert.equal((await send(await event(sub))).status, 200);
  assert.equal((await send(old)).status, 200);
  assert.equal((await me()).subscription.active, true);
  assert.equal((await me()).subscription.renewal_status, 'cancelled');
  assert.equal((await db.prepare('SELECT status FROM subscriptions WHERE user_id=?').bind(user.id).first()).status, 'cancelled');
});
test('webhook for another subscription or user cannot replace the local binding', async () => {
  const sub = await start(); const other = {...structuredClone(sub), id: 'other-sub', external_reference: randomUUID()}; subs.set(other.id, other);
  const r = await send(await event(other)); assert.deepEqual(await r.json(), {ok: true, ignored: true});
  assert.equal((await db.prepare('SELECT mp_subscription_id FROM subscriptions WHERE user_id=?').bind(user.id).first()).mp_subscription_id, sub.id);
});
test('authorized-payment and payment events recheck current canonical subscription', async () => {
  const sub = await start(); const payment = approve(sub);
  assert.equal((await send(await event(sub, {id: charges[0].id, type: 'subscription_authorized_payment'}))).status, 200);
  payment.transaction_amount_refunded = 4.9;
  assert.equal((await send(await event(sub, {id: String(payment.id), type: 'payment'}))).status, 200);
  assert.equal((await me()).subscription.active, false);
});
test('cancel uses authenticated ownership and confirms provider state; subsequent checkout is a new generation', async () => {
  const sub = await start(); approve(sub);
  assert.equal((await request('/api/subscription/cancel', {})).status, 200);
  assert.equal(sub.status, 'cancelled'); assert.equal((await me()).subscription.active, true);
  assert.equal((await request('/api/checkout', {})).status,409);
  clock=Date.parse((await me()).subscription.access_until);
  await signIn(); await start(); assert.equal(created, 2);
});
test('cross-origin cancellation and anonymous checkout are forbidden', async () => {
  await start();
  assert.equal((await request('/api/subscription/cancel', {}, {origin: 'https://attacker.example'})).status, 403);
  const r = await mf.dispatchFetch(ORIGIN + '/api/checkout', {method: 'POST', headers: {origin: ORIGIN, 'x-test-clock': String(clock)}, body: '{}'}); assert.equal(r.status, 401);
});


test('lease fencing prevents a stale process from overwriting the replacement owner', async () => {
  let release;
  gate = () => new Promise(resolve => {release = resolve;});
  const pending = request('/api/checkout', {});
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  await db.prepare('UPDATE billing_locks SET owner=?,expires_at=? WHERE user_id=?').bind('replacement-owner', clock + 120000, user.id).run();
  release();
  assert.equal((await pending).status, 409);
  assert.equal(await db.prepare('SELECT id FROM subscriptions WHERE user_id=?').bind(user.id).first(), null);
  assert.equal((await db.prepare('SELECT owner FROM billing_locks WHERE user_id=?').bind(user.id).first()).owner, 'replacement-owner');
  assert.equal((await db.prepare('SELECT state FROM billing_checkout WHERE user_id=?').bind(user.id).first()).state, 'creating');
  assert.equal(created, 1);
});

test('newer failed invoice revokes access even when an older paid period overlaps', async () => {
  const sub = await start(); approve(sub, {debit: clock - 86400000});
  approve(sub, {paymentStatus: 'rejected', debit: clock - 1000});
  assert.equal((await me()).subscription.active, false);
  assert.equal((await request('/api/lists')).status, 403);
});

test('an invoice tied to another subscription or an altered payment never grants access', async () => {
  const sub = await start(), payment = approve(sub);
  payment.payer.id = 999; assert.equal((await me()).subscription.active, false);
  payment.payer.id = 456; payment.transaction_amount = 49; assert.equal((await me()).subscription.active, false);
  payment.transaction_amount = 4.9; payment.currency_id = 'USD'; assert.equal((await me()).subscription.active, false);
});


test('payment history is paginated and the current paid period is found beyond older invoices', async () => {
  const sub = await start();
  for (let i = 101; i >= 1; i--) approve(sub, {debit: clock - i * 32 * 86400000});
  approve(sub);
  assert.equal((await me()).subscription.active, true);
  assert.equal((await request('/api/lists')).status, 200);
});

test('paid cancellation preserves access with a separate cancelled renewal and cached date is not proof', async () => {
  const sub = await start(); approve(sub, {debit: Date.parse('2026-01-01T12:00:00Z')});
  const r = await request('/api/subscription/cancel', {}), result = await r.json();
  assert.equal(r.status, 200);
  assert.equal(result.subscription.active, true);
  assert.equal(result.subscription.status, 'cancelled');
  assert.equal(result.subscription.renewal_status, 'cancelled');
  assert.equal(result.subscription.access_status, 'pro_cancelled');
  assert.equal(result.subscription.access_until, '2026-02-01T12:00:00.000Z');
  assert.equal((await request('/api/lists', {name: 'Paid remaining', items: ['A']})).status, 201);
  assert.equal((await request('/api/lists')).status, 200);
  assert.equal((await me()).subscription.active, true);
  assert.equal(cancellations, 1);
  const again=await request('/api/subscription/cancel',{});
  assert.equal((await again.json()).subscription.access_until,result.subscription.access_until);
  assert.equal(cancellations,1);
  // Even a wildly extended stored deadline is ignored.
  await db.prepare('UPDATE subscriptions SET current_period_end=? WHERE user_id=?').bind('2099-01-01T00:00:00Z', user.id).run();
  clock = Date.parse('2026-02-01T11:59:59.999Z');
  assert.equal((await me()).subscription.active, true);
  clock++;
  assert.equal((await me()).subscription.active, false);
  assert.equal((await me()).subscription.access_status, 'expired');
  assert.equal((await request('/api/lists')).status, 403);
  assert.equal((await request('/api/lists', {name: 'Denied', items: ['A']})).status, 403);
  clock++;
  assert.equal((await me()).subscription.active, false);
  assert.equal(created, 1); assert.equal(cancellations, 1);
});

test('cancellation before first payment and after rejected payment never grants a free period', async () => {
  const sub = await start();
  let r = await request('/api/subscription/cancel', {});
  assert.equal((await r.json()).subscription.active, false);
  assert.equal((await me()).subscription.access_status, 'free');
  assert.equal((await request('/api/lists')).status, 403);
  const next = await start(); approve(next, {paymentStatus: 'rejected'});
  r = await request('/api/subscription/cancel', {});
  assert.equal((await r.json()).subscription.active, false);
  assert.equal((await me()).subscription.active, false);
  assert.equal(sub.status, 'cancelled'); assert.equal(next.status, 'cancelled');
});

test('refund, chargeback and payment cancellation after subscription cancellation revoke access', async () => {
  const sub = await start(), payment = approve(sub);
  await request('/api/subscription/cancel', {});
  for (const status of ['refunded', 'charged_back', 'cancelled', 'rejected']) {
    payment.status = status;
    assert.equal((await me()).subscription.active, false, status);
    assert.equal((await request('/api/lists')).status, 403, status);
  }
  payment.status = 'approved'; payment.transaction_amount_refunded = 4.9;
  assert.equal((await me()).subscription.active, false);
});

test('duplicate and delayed webhooks cannot extend cancelled access or undo a refund', async () => {
  const sub = await start(), payment = approve(sub);
  const old = await event(sub, {body: {status: 'authorized'}});
  await request('/api/subscription/cancel', {});
  const cancelled = await event(sub);
  assert.equal((await send(cancelled)).status, 200);
  assert.equal((await (await send(cancelled)).json()).duplicate, true);
  const until = (await me()).subscription.access_until;
  clock += 1000;
  assert.equal((await send(old)).status, 200);
  assert.equal((await me()).subscription.access_until, until);
  assert.equal((await me()).subscription.renewal_status, 'cancelled');
  payment.status = 'charged_back';
  assert.equal((await send(await event(sub, {id: String(payment.id), type: 'payment'}))).status, 200);
  assert.equal((await me()).subscription.active, false);
  assert.equal((await (await send(old)).json()).duplicate, true);
  assert.equal((await me()).subscription.active, false);
});

test('provider outage after confirmed cancellation fails closed without pretending recurrence continued', async () => {
  const sub = await start(); approve(sub);
  paymentUnavailable = true;
  const r = await request('/api/subscription/cancel', {}), result = await r.json();
  assert.equal(r.status, 200); assert.equal(sub.status, 'cancelled');
  assert.equal(result.subscription.renewal_status, 'cancelled');
  assert.equal(result.subscription.access_status, 'unverified'); assert.equal(result.subscription.active, false);
  assert.equal((await request('/api/lists')).status, 403);
  paymentUnavailable = false; assert.equal((await me()).subscription.active, true);
  fail = true; assert.equal((await me()).subscription.active, false);
});

test('cancellation end_date cannot erase a settled month and retired plan can still prove an existing entitlement', async () => {
  const sub = await start(); approve(sub, {debit: Date.parse('2026-01-01T12:00:00Z')});
  await request('/api/subscription/cancel', {});
  sub.auto_recurring.end_date = new Date(clock).toISOString();
  planOverride = {status: 'inactive'};
  const result = (await me()).subscription;
  assert.equal(result.active, true); assert.equal(result.access_until, '2026-02-01T12:00:00.000Z');
  assert.equal((await me()).billing.configured, false);
  sub.external_reference = randomUUID(); assert.equal((await me()).subscription.active, false);
});

test('cancelled period clamps January 31 to February 28 and stops exactly at the boundary', async () => {
  clock = Date.parse('2026-02-01T12:00:00Z');
  await signIn();
  const sub = await start(); approve(sub, {debit: Date.parse('2026-01-31T12:00:00Z')});
  await request('/api/subscription/cancel', {});
  assert.equal((await me()).subscription.access_until, '2026-02-28T12:00:00.000Z');
  clock = Date.parse('2026-02-28T11:59:59.999Z'); assert.equal((await me()).subscription.active, true);
  clock++; assert.equal((await me()).subscription.active, false);
});

test('an unpaid later attempt does not erase a different verified paid period after cancellation', async () => {
  const sub = await start();
  approve(sub, {debit: Date.parse('2026-01-01T12:00:00Z')});
  approve(sub, {paymentStatus: 'rejected', debit: Date.parse('2026-01-14T12:00:00Z')});
  const result = await (await request('/api/subscription/cancel', {})).json();
  assert.equal(result.subscription.active, true);
  assert.equal(result.subscription.access_until, '2026-02-01T12:00:00.000Z');
  assert.equal((await request('/api/lists')).status, 200);
  clock = Date.parse('2026-02-01T12:00:00Z');
  assert.equal((await me()).subscription.active, false);
  assert.equal(created, 1); assert.equal(cancellations, 1);
});
