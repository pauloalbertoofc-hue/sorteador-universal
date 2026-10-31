import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutAllowed,checkout,BillingError} from '../src/billing.js';
const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
test('pilot disabled without billing flag',()=>assert.equal(checkoutAllowed({BILLING_MODE:'pilot',BILLING_PILOT_USER_ID:id,BILLING_ENABLED:'false'},{id}),false));
test('pilot restricted to exact authenticated account',()=>{
 const env={BILLING_MODE:'pilot',BILLING_PILOT_USER_ID:id,BILLING_ENABLED:'true'};
 assert.equal(checkoutAllowed(env,{id}),true);
 assert.equal(checkoutAllowed(env,{id:other}),false);
 assert.equal(checkoutAllowed(env,null),false);
});
test('pilot rejects missing or malformed allowlist',()=>{
 for(const value of [undefined,'',other.slice(0,6)])assert.equal(checkoutAllowed({BILLING_MODE:'pilot',BILLING_PILOT_USER_ID:value,BILLING_ENABLED:'true'},{id}),false);
});
test('unknown mode and absent mode remain closed',()=>{
 for(const mode of [undefined,'testing',''])assert.equal(checkoutAllowed({BILLING_MODE:mode,BILLING_ENABLED:'true'},{id}),false);
});
test('public requires explicit mode',()=>{
 assert.equal(checkoutAllowed({BILLING_MODE:'public',BILLING_ENABLED:'true'},{id}),true);
});
test('unauthorized pilot user cannot reach provider even when credentials exist',async()=>{
 await assert.rejects(checkout({BILLING_MODE:'pilot',BILLING_PILOT_USER_ID:id,BILLING_ENABLED:'true',MP_ACCESS_TOKEN:'fake',MP_WEBHOOK_SECRET:'fake',MP_PLAN_ID:'0123456789abcdef0123456789abcdef',PUBLIC_SITE_URL:'https://example.com'}, {id:other}),e=>e instanceof BillingError);
});
