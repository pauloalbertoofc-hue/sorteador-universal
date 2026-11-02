import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedPlanCheckoutUrl, BillingError } from '../src/billing.js';
const id='9116f5f55f564c2c9d29b80dc2e9ad3d';
const valid='https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id='+id;
test('accepts hosted checkout URL for the exact plan',()=>{
  assert.equal(hostedPlanCheckoutUrl({id,init_point:valid},id),valid);
});
for (const url of [
  'https://evil.example/subscriptions/checkout?preapproval_plan_id='+id,
  'http://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id='+id,
  'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=wrong',
  'https://www.mercadopago.com.br.evil.example/subscriptions/checkout?preapproval_plan_id='+id,
  'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id='+id+'#fragment',
  'https://user:pass@www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id='+id,
  'https://www.mercadopago.com.br/redirect?preapproval_plan_id='+id
]) {
  test('rejects untrusted hosted URL: '+url,()=>{
    assert.throws(()=>hostedPlanCheckoutUrl({id,init_point:url},id),BillingError);
  });
}
test('rejects a valid URL paired with the wrong plan',()=>{
  assert.throws(()=>hostedPlanCheckoutUrl({id:'other',init_point:valid},id),BillingError);
});
