import test from 'node:test';
import assert from 'node:assert/strict';
import {hostedClaimMatchesAccount} from '../src/hosted-claim.js';
const account={id:'9f95ed18-8b4f-4cc5-b601-6216d9947144',email:'Pilot@example.test'};
const subscription={preapproval_plan_id:'plan-1',collector_id:123,external_reference:account.id,payer_email:'pilot@example.test',status:'pending'};
const check=(sub,acct=account)=>hostedClaimMatchesAccount({subscription:sub,account:acct,planId:'plan-1',collectorId:123});
test('only exact authenticated account binding passes',()=>assert.equal(check(subscription),true));
for(const [label,patch] of Object.entries({
  'missing external reference':{external_reference:null},
  'another user':{external_reference:'00000000-0000-4000-8000-000000000000'},
  'different payer':{payer_email:'other@example.test'},
  'different seller':{collector_id:999},
  'different plan':{preapproval_plan_id:'plan-2'},
  'unknown status':{status:'other'}
}))test('rejects '+label,()=>assert.equal(check({...subscription,...patch}),false));
test('rejects a different signed-in account',()=>assert.equal(check(subscription,{...account,id:'00000000-0000-4000-8000-000000000000'}),false));
test('rejects missing account',()=>assert.equal(check(subscription,null),false));
