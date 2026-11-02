import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingSubscriptionRequest} from '../src/mp-subscription-contract.js';
const args={userId:'9f95ed18-8b4f-4cc5-b601-6216d9947144',email:'pilot@example.test',backUrl:'https://sorteador.example.test/?billing=return'};
test('pending subscription uses explicit BRL 4.90 monthly recurring terms without plan id',()=>{
 const body=pendingSubscriptionRequest(args);
 assert.equal(body.status,'pending');
 assert.equal(body.preapproval_plan_id,undefined);
 assert.deepEqual(body.auto_recurring,{frequency:1,frequency_type:'months',transaction_amount:4.9,currency_id:'BRL'});
 assert.equal(body.external_reference,args.userId);
});
test('rejects insecure callback',()=>assert.throws(()=>pendingSubscriptionRequest({...args,backUrl:'http://example.test'})));
test('rejects missing account reference',()=>assert.throws(()=>pendingSubscriptionRequest({...args,userId:''})));
