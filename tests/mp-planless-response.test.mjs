import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlanlessPendingSubscription as verify} from '../src/mp-planless-response.js';
const account={id:'9f95ed18-8b4f-4cc5-b601-6216d9947144',email:'pilot@example.test'};
const subscription={id:'sub_123',external_reference:account.id,collector_id:123,payer_email:account.email,status:'pending',preapproval_plan_id:null,auto_recurring:{frequency:1,frequency_type:'months',currency_id:'BRL',transaction_amount:4.9},init_point:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=sub_123'};
const check=(patch={})=>verify({subscription:{...subscription,...patch},account,sellerId:123});
test('accepts exact pending subscription and returns validated checkout URL',()=>{
 assert.deepEqual(check(),{subscriptionId:'sub_123',checkoutUrl:subscription.init_point});
});
for(const [name,patch] of Object.entries({
 'other user':{external_reference:'00000000-0000-4000-8000-000000000000'},
 'other seller':{collector_id:999},
 'different payer':{payer_email:'other@example.test'},
 'unexpected plan':{preapproval_plan_id:'plan_1'},
 'authorized without payment':{status:'authorized'},
 'wrong price':{auto_recurring:{...subscription.auto_recurring,transaction_amount:5.9}},
 'wrong currency':{auto_recurring:{...subscription.auto_recurring,currency_id:'USD'}},
 'wrong frequency':{auto_recurring:{...subscription.auto_recurring,frequency:2}},
 'fake host':{init_point:'https://www.mercadopago.com.br.evil.test/subscriptions/checkout?preapproval_id=sub_123'},
 'other subscription':{init_point:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=sub_999'},
 'insecure URL':{init_point:'http://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=sub_123'},
 'free trial':{auto_recurring:{...subscription.auto_recurring,free_trial:{frequency:1,frequency_type:'months'}}}
}))test('rejects '+name,()=>assert.throws(()=>check(patch)));
