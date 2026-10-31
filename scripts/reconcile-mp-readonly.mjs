// Read-only, independent searches to reconcile an ambiguous checkout attempt.
// No mutations, no token/email/provider IDs in stdout.
import {configureAdminNetwork} from './lib/mp-admin-transport.mjs';
const env=process.env;
const fail=code=>{console.error(JSON.stringify({outcome:'not_verified',code}));process.exitCode=1;};
const validPlan=/^[a-f0-9]{32}$/i, validUser=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function search(filters){
  const rows=[],ids=new Set();let total;
  for(let page=0;page<5;page++){
    const query=new URLSearchParams({...filters,limit:'100',offset:String(page*100)});
    const response=await fetch('https://api.mercadopago.com/preapproval/search?'+query,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.MP_ACCESS_TOKEN,Accept:'application/json'}});
    if(!response.ok)throw Error('provider_http_'+response.status);
    const data=await response.json();
    if(!Array.isArray(data.results)||!Number.isSafeInteger(data.paging?.total)||data.paging.total<0||data.paging.total>500||(total!==undefined&&total!==data.paging.total))throw Error('invalid_pagination');
    total=data.paging.total;
    for(const item of data.results){
      if(!item||typeof item.id!=='string'||ids.has(item.id))throw Error('invalid_item');
      ids.add(item.id);rows.push(item);
    }
    if(rows.length===total)return rows;
    if(!data.results.length||rows.length>total)throw Error('incomplete_pagination');
  }
  throw Error('incomplete_pagination');
}
const checks={
  environment:env.MP_ENVIRONMENT==='production',
  plan_id:validPlan.test(env.MP_PLAN_ID||''),
  pilot_user_id:validUser.test(env.BILLING_PILOT_USER_ID||''),
  access_token:typeof env.MP_ACCESS_TOKEN==='string'&&env.MP_ACCESS_TOKEN.length>0,
  pilot_email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BILLING_PILOT_EMAIL||'')
};
if(Object.values(checks).some(value=>!value)){
  console.error(JSON.stringify({outcome:'not_verified',code:'missing_or_invalid_local_configuration',invalid_fields:Object.keys(checks).filter(key=>!checks[key])}));
  process.exitCode=1;
}else{
  let restore=()=>{};
  try{
    restore=configureAdminNetwork();
    // Query by different keys to catch stale or unexpected payer/plan association.
    const queries=[
      {payer_email:env.BILLING_PILOT_EMAIL,preapproval_plan_id:env.MP_PLAN_ID},
      {payer_email:env.BILLING_PILOT_EMAIL},
      {preapproval_plan_id:env.MP_PLAN_ID}
    ];
    const results=[];
    for(const query of queries)results.push(await search(query));
    const all=new Map();
    for(const rows of results)for(const item of rows)all.set(item.id,item);
    const related=[...all.values()].filter(item=>item.external_reference===env.BILLING_PILOT_USER_ID||item.preapproval_plan_id===env.MP_PLAN_ID&&item.payer_email?.toLowerCase()===env.BILLING_PILOT_EMAIL.toLowerCase());
    const statuses={};
    for(const item of related){const state=typeof item.status==='string'?item.status:'unknown';statuses[state]=(statuses[state]||0)+1;}
    console.log(JSON.stringify({outcome:'verified_read_only',search_counts:results.map(x=>x.length),related_subscriptions:related.length,statuses,decision:related.length===0?'no_related_subscription_in_three_searches':'manual_reconciliation_required'}));
  }catch(error){fail(/^provider_http_\d+$/.test(error.message)?error.message:'provider_query_failed_or_incomplete');}
  finally{restore();}
}
