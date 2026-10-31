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
