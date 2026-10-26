import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {findPlan,verifyPlan,safeError,EXPECTED} from '../scripts/lib/mp-plan-admin.mjs';
const ID='a'.repeat(32), OTHER='b'.repeat(32), TOKEN='synthetic-admin-token-do-not-output';
const env={MP_ACCESS_TOKEN:TOKEN,MP_ENVIRONMENT:'production',MP_PLAN_ID:ID};
const plan=(patch={})=>({id:ID,reason:EXPECTED.name,application_id:EXPECTED.application,collector_id:123,status:'active',auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:4.9,currency_id:'BRL'},...patch});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
function mock(plans=[plan()],options={}){
 const calls=[];
 const fetchImpl=async(url,init)=>{
  const u=new URL(url);calls.push(u.pathname+u.search);
  assert.equal(u.origin,'https://api.mercadopago.com');assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.equal(init.headers.authorization,`Bearer ${TOKEN}`);assert.equal(init.body,undefined);
  if(options.network)throw Error(TOKEN+' private@example.test');
  if(options.status)return json({message:TOKEN,email:'private@example.test'},options.status);
  if(u.pathname==='/users/me')return json(options.seller||{id:123,tags:[]});
  if(u.pathname==='/preapproval_plan/search'){
   const offset=Number(u.searchParams.get('offset')),limit=options.pageSize||50;
   assert.deepEqual([...u.searchParams.keys()],['limit','offset']);
   if(options.badPaging)return json({paging:{total:2,limit:50,offset},results:offset?[]:[{id:ID}]});
   return json({paging:{total:plans.length,offset,limit},results:plans.slice(offset,offset+limit).map(p=>({id:p.id}))});
  }
  const p=plans.find(p=>p.id===u.pathname.split('/').at(-1));
  return json(options.change&&calls.filter(c=>c==='/preapproval_plan/'+ID).length>1?plan({status:'inactive'}):p||{},p?200:404);
 };
 return {fetchImpl,calls};
}
const rejects=async(operation,code)=>assert.rejects(operation,error=>{assert.equal(error.code,code);const rendered=JSON.stringify(safeError(error));assert.ok(!rendered.includes(TOKEN));assert.ok(!rendered.includes('private@example.test'));return true;});

test('finds exactly one compatible plan, reads detail and revalidates without any write',async()=>{
 const m=mock();const result=await findPlan(env,m);
 assert.equal(result.outcome,'found');assert.equal(result.preapproval_plan_id,ID);assert.equal(result.reference_checked,false);
 assert.equal(m.calls.filter(c=>c==='/preapproval_plan/'+ID).length,2);
 assert.ok(!JSON.stringify(result).includes('123'));assert.ok(!JSON.stringify(result).includes(TOKEN));
});
test('reference is compared when returned and never fabricated when absent',async()=>{
 assert.equal((await findPlan(env,mock([plan({external_reference:EXPECTED.reference})]))).reference_checked,true);
 const result=await findPlan(env,mock([plan({external_reference:'OTHER-PRODUCT'})]));assert.equal(result.outcome,'not_found');assert.equal(result.preapproval_plan_id,undefined);
});
test('no plans reports not_found without a guessed identifier',async()=>{
 const result=await findPlan(env,mock([]));assert.equal(result.outcome,'not_found');assert.equal(result.scanned,0);assert.equal(result.preapproval_plan_id,undefined);
});
test('duplicate compatible plans report ambiguity without exposing IDs',async()=>{
 const result=await findPlan(env,mock([plan(),plan({id:OTHER})]));assert.equal(result.outcome,'ambiguous');assert.equal(result.candidates,2);assert.equal(result.preapproval_plan_id,undefined);assert.ok(!JSON.stringify(result).includes(ID));
});
test('401/403 errors never echo provider response or credentials',async()=>{
 for(const status of [401,403])await rejects(findPlan(env,mock([],{status})),'authentication_denied');
});
test('test account cannot be mistaken for production and vice versa',async()=>{
 await rejects(findPlan(env,mock([],{seller:{id:123,tags:['test_user']}})),'environment_mismatch');
 await rejects(findPlan({...env,MP_ENVIRONMENT:'test'},mock()),'environment_mismatch');
 const result=await findPlan({...env,MP_ENVIRONMENT:'test'},mock([plan({live_mode:false})],{seller:{id:123,tags:['test_user']}}));assert.equal(result.outcome,'found');assert.equal(result.environment,'test');
});
test('explicit live_mode mismatch and TEST token in production are rejected',async()=>{
 const result=await findPlan(env,mock([plan({live_mode:false})]));assert.equal(result.outcome,'not_found');
 await rejects(findPlan({...env,MP_ACCESS_TOKEN:'TEST-synthetic'},mock()),'environment_mismatch');
});
test('paginates entire catalog and individually verifies even incomplete summaries',async()=>{
 const m=mock([plan({id:OTHER,reason:'Other product'}),plan()],{pageSize:1});const result=await findPlan(env,m);assert.equal(result.preapproval_plan_id,ID);assert.equal(result.scanned,2);assert.ok(m.calls.includes('/preapproval_plan/search?limit=50&offset=1'));
});
test('incomplete pagination cannot select a partial unique candidate',async()=>{
 await rejects(findPlan(env,mock([plan()],{badPaging:true})),'pagination_incomplete');
});
for(const [name,patch] of [
 ['wrong amount',{transaction_amount:49}],['wrong currency',{currency_id:'USD'}],['wrong frequency',{frequency:2}],['wrong frequency unit',{frequency_type:'days'}],['free trial',{free_trial:{frequency:1,frequency_type:'months'}}],['finite repetitions',{repetitions:12}],['prorated first payment',{billing_day_proportional:true}]
])test(name+' is commercially incompatible',async()=>{
 const result=await findPlan(env,mock([plan({auto_recurring:{...plan().auto_recurring,...patch}})]));assert.equal(result.outcome,'not_found');assert.equal(result.incompatible,1);assert.equal(result.preapproval_plan_id,undefined);
});
test('wrong seller, application, status or name cannot identify the product',async()=>{
 for(const patch of [{collector_id:999},{application_id:'999'},{status:'inactive'},{reason:'Different product'}])assert.equal((await findPlan(env,mock([plan(patch)]))).outcome,'not_found');
});
test('incomplete detail or identity fails closed',async()=>{
 await rejects(findPlan(env,mock([plan({auto_recurring:undefined})])),'incomplete_plan');
 await rejects(findPlan(env,mock([plan({application_id:undefined})])),'incomplete_plan');
 await rejects(findPlan(env,mock([],{seller:{id:123}})),'incomplete_identity');
});
test('404 does not claim a plan is absent in all accounts/environments',async()=>{
 await rejects(verifyPlan({...env,MP_PLAN_ID:OTHER},mock()),'not_visible');
});
test('provider 500/429 and network errors remain sanitized',async()=>{
 for(const status of [500,429,302])await rejects(findPlan(env,mock([],{status})),'api_error');
 await rejects(findPlan(env,mock([],{network:true})),'network_error');
 assert.ok(!JSON.stringify(safeError(Error(TOKEN))).includes(TOKEN));
});
test('a plan that changes before final verification cannot be selected',async()=>{
 await rejects(findPlan(env,mock([plan()],{change:true})),'plan_changed');
});
test('verify command shares commercial, identity and application validation',async()=>{
 assert.equal((await verifyPlan(env,mock())).outcome,'verified');
 await rejects(verifyPlan(env,mock([plan({auto_recurring:{...plan().auto_recurring,transaction_amount:49}})])),'commercial_mismatch');
 await rejects(verifyPlan({...env,MP_PLAN_ID:'4465213801165623'},mock()),'missing_plan');
});
test('environment is explicit and CLI configuration failure does not leak the injected token',async()=>{
 await rejects(findPlan({...env,MP_ENVIRONMENT:undefined},mock()),'missing_environment');
 const result=spawnSync(process.execPath,['scripts/find-mp-plan.mjs'],{encoding:'utf8',env:{...process.env,MP_ACCESS_TOKEN:TOKEN,MP_ENVIRONMENT:''}});
 assert.equal(result.status,1);assert.equal(result.stdout,'');assert.ok(!result.stderr.includes(TOKEN));assert.match(result.stderr,/missing_environment/);
});


test('oversized catalogs and repeated identifiers fail before any ID can be selected',async()=>{
 const fetchImpl=async(url,init)=>{
  assert.equal(init.method,'GET');
  return new URL(url).pathname==='/users/me'?json({id:123,tags:[]}):json({paging:{total:501,offset:0,limit:50},results:[]});
 };
 await rejects(findPlan(env,{fetchImpl}),'pagination_incomplete');
 await rejects(findPlan(env,mock([plan(),plan()])),'pagination_incomplete');
});

test('malformed JSON is sanitized and unknown duration/proration cannot pass compatibility',async()=>{
 await rejects(findPlan(env,{fetchImpl:async()=>new Response(TOKEN+' private@example.test')}),'incomplete_response');
 for(const patch of [{repetitions:0},{end_date:'2027-01-01T00:00:00Z'},{billing_day_proportional:'false'}]){
  assert.equal((await findPlan(env,mock([plan({auto_recurring:{...plan().auto_recurring,...patch}})]))).outcome,'not_found');
 }
});
