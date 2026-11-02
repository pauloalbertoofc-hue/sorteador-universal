import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {checkout, syncSubscription, BillingError} from '../src/billing.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const user = {id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com'};
const planId = '0123456789abcdef0123456789abcdef';
const sellerId = 12345;
const envBase = {MP_ACCESS_TOKEN: 'fake-token', MP_WEBHOOK_SECRET: 'fake-secret', MP_PLAN_ID: planId, PUBLIC_SITE_URL: 'https://example.com/'};
const schedule = {frequency: 1, frequency_type: 'months', currency_id: 'BRL', transaction_amount: 4.9};
const ctx = {seller: {id: sellerId}, plan: {id: planId}};
const subscription = (status = 'authorized') => ({id: 'sub-123', status, external_reference: user.id, collector_id: sellerId, preapproval_plan_id: planId, auto_recurring: schedule, payer_id: 987});
function fakeDB(existing = null) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM subscriptions')) return existing;
              if (sql.includes('FROM billing_checkout')) return null;
              if (sql.includes('INSERT INTO billing_locks')) return {owner: params[1]};
              if (sql.includes('SELECT owner FROM billing_locks')) return {owner: params[1]};
              return null;
            },
            async run() {writes.push(sql); return {meta: {changes: 1}};}
          };
        }
      };
    }
  };
}
const fence = Object.assign(async () => {}, {write: async () => {}});
test('checkout remains disabled without billing flag, even with configured credentials', async () => {
  await assert.rejects(checkout({...envBase, BILLING_ENABLED: 'false'}, user), e => e instanceof BillingError && e.status === 503);
});
test('authorized subscription without settled payment never grants Pro', async () => {
  const db = fakeDB();
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /authorized_payments\/search/);
    return Response.json({results: [], paging: {total: 0}});
  };
  try {
    const result = await syncSubscription({...envBase, DB: db}, user, subscription(), ctx, fence);
    assert.equal(result.active, false);
    assert.equal(result.access_status, 'free');
  } finally {globalThis.fetch = original;}
});
test('subscription with another user reference is rejected before any write', async () => {
  const db = fakeDB();
  await assert.rejects(syncSubscription({...envBase, DB: db}, user, {...subscription(), external_reference: 'someone-else'}, ctx, fence), e => e instanceof BillingError && e.status === 502);
  assert.equal(db.writes.length, 0);
});
test('subscription from another seller is rejected before any write', async () => {
  const db = fakeDB();
  await assert.rejects(syncSubscription({...envBase, DB: db}, user, {...subscription(), collector_id: 999}, ctx, fence), e => e instanceof BillingError && e.status === 502);
  assert.equal(db.writes.length, 0);
});
test('pending subscription does not grant Pro', async () => {
  const result = await syncSubscription({...envBase, DB: fakeDB()}, user, subscription('pending'), ctx, fence);
  assert.equal(result.active, false);
});

function paidProvider({paymentStatus = 'approved', chargeStatus = 'processed', refunded = 0, debitDaysAgo = 2} = {}) {
  const debit = new Date(Date.now() - debitDaysAgo * 86400000).toISOString();
  const approved = new Date(Date.now() - (debitDaysAgo - 0.1) * 86400000).toISOString();
  return async url => {
    const u = String(url);
    if (u.includes('/authorized_payments/search')) return Response.json({results: [{
      id: 'charge-1', preapproval_id: 'sub-123', debit_date: debit,
      status: chargeStatus, payment: {id: 'payment-1', status: paymentStatus}
    }], paging: {total: 1}});
    if (u.includes('/v1/payments/payment-1')) return Response.json({
      id: 'payment-1', collector_id: sellerId, payer: {id: 987},
      currency_id: 'BRL', transaction_amount: 4.9, transaction_amount_refunded: refunded,
      status: paymentStatus, date_approved: approved
    });
    throw new Error('Unexpected provider endpoint');
  };
}
async function withProvider(provider, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = provider;
  try {return await callback();} finally {globalThis.fetch = original;}
}
test('approved settled payment grants Pro for a bounded monthly period', async () => {
  await withProvider(paidProvider(), async () => {
    const result = await syncSubscription({...envBase, DB: fakeDB()}, user, subscription(), ctx, fence);
    assert.equal(result.active, true);
    assert.equal(result.access_status, 'pro_active');
    assert.ok(Date.parse(result.access_until) > Date.now());
  });
});
test('cancelled subscription preserves only already-paid access', async () => {
  await withProvider(paidProvider(), async () => {
    const result = await syncSubscription({...envBase, DB: fakeDB()}, user, subscription('cancelled'), ctx, fence);
    assert.equal(result.active, true);
    assert.equal(result.access_status, 'pro_cancelled');
    assert.equal(result.can_cancel, false);
  });
});
test('refunded payment never grants Pro', async () => {
  await withProvider(paidProvider({refunded: 4.9}), async () => {
    const result = await syncSubscription({...envBase, DB: fakeDB()}, user, subscription(), ctx, fence);
    assert.equal(result.active, false);
  });
});
test('failed latest payment never grants Pro on an authorized subscription', async () => {
  await withProvider(paidProvider({paymentStatus: 'rejected', chargeStatus: 'rejected'}), async () => {
    const result = await syncSubscription({...envBase, DB: fakeDB()}, user, subscription(), ctx, fence);
    assert.equal(result.active, false);
  });
});
test('expired paid period does not grant Pro', async () => {
  await withProvider(paidProvider({debitDaysAgo: 65}), async () => {
    const result = await syncSubscription({...envBase, DB: fakeDB()}, user, subscription(), ctx, fence);
    assert.equal(result.active, false);
  });
});

test('existing active subscription prevents another checkout without creating a charge', async () => {
  const existing = {mp_subscription_id: 'sub-123', status: 'authorized'};
  const db = fakeDB(existing);
  const requests = [];
  await withProvider(async (url, options = {}) => {
    requests.push({url: String(url), method: options.method || 'GET'});
    if (String(url).endsWith('/users/me')) return Response.json({id: sellerId});
    if (String(url).includes('/preapproval_plan/')) return Response.json({id: planId, collector_id: sellerId, status: 'active', auto_recurring: schedule});
    if (String(url).includes('/preapproval/sub-123')) return Response.json(subscription());
    throw Error('Unexpected API endpoint');
  }, async () => {
    await assert.rejects(checkout({...envBase, BILLING_ENABLED: 'true', BILLING_MODE: 'pilot', BILLING_PILOT_USER_ID: user.id, DB: db}, user),
      err => err instanceof BillingError && err.status === 409);
  });
  assert.equal(requests.filter(r => r.method === 'POST').length, 0);
});

test('existing pending subscription reuses provider checkout URL without new POST', async () => {
  const existing = {mp_subscription_id: 'sub-123', status: 'pending'};
  const db = fakeDB(existing);
  const requests = [];
  await withProvider(async (url, options = {}) => {
    requests.push({url: String(url), method: options.method || 'GET'});
    if (String(url).endsWith('/users/me')) return Response.json({id: sellerId});
    if (String(url).includes('/preapproval_plan/')) return Response.json({id: planId, collector_id: sellerId, status: 'active', auto_recurring: schedule});
    if (String(url).includes('/preapproval/sub-123')) return Response.json({...subscription('pending'), init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=sub-123'});
    throw Error('Unexpected API endpoint');
  }, async () => {
    const result = await checkout({...envBase, BILLING_ENABLED: 'true', BILLING_MODE: 'pilot', BILLING_PILOT_USER_ID: user.id, DB: db}, user);
    assert.match(result.checkout_url, /preapproval_id=sub-123/);
  });
  assert.equal(requests.filter(r => r.method === 'POST').length, 0);
});

test('provider checkout HTTP error logs only a redacted status and never retries', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  let postCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/users/me')) return Response.json({id: sellerId});
    if (path.includes('/preapproval_plan/')) return Response.json({id: planId, collector_id: sellerId, status: 'active', auto_recurring: schedule});
    if (path.endsWith('/preapproval/') && options.method === 'POST') {
      postCount++;
      return Response.json({message: 'sensitive-provider-response'}, {status: 422});
    }
    throw new Error('unexpected endpoint');
  };
  console.warn = (...args) => warnings.push(args);
  try {
    await assert.rejects(checkout({...envBase, DB: fakeDB(), BILLING_ENABLED: 'true', BILLING_MODE: 'pilot', BILLING_PILOT_USER_ID: user.id}, user), e => e instanceof BillingError && e.status === 502);
    assert.equal(postCount, 1);
    assert.deepEqual(warnings, [['[SU_BILLING] checkout_provider_diagnostic', {phase: 'http', status: 422, provider_code: 'unclassified', category: 'provider_validation'}]]);
    assert.ok(!JSON.stringify(warnings).includes('sensitive-provider-response'));
    assert.ok(!JSON.stringify(warnings).includes(user.email));
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
