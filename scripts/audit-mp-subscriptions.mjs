// Read-only subscription reconciliation. No POST, PUT, DELETE or DB access.
// Never prints credentials, customer email, subscription IDs or raw provider responses.
import {configureAdminNetwork} from './lib/mp-admin-transport.mjs';
const validPlan=/^[a-f0-9]{32}$/i;
const validUser=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const env=process.env;
function error(code){console.error(JSON.stringify({outcome:'not_verified',code}));process.exitCode=1;}
if(env.MP_ENVIRONMENT!=='production'||!validPlan.test(env.MP_PLAN_ID||'')||!validUser.test(env.BILLING_PILOT_USER_ID||'')||!env.MP_ACCESS_TOKEN||!env.BILLING_PILOT_EMAIL||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BILLING_PILOT_EMAIL)) {
  error('missing_or_invalid_local_configuration');
}else{
  let restore=()=>{};
  try {
    restore=configureAdminNetwork();
    const found=[], seen=new Set();
    let total=null;
    for(let page=0;page<5;page++){
      const params=new URLSearchParams({payer_email:env.BILLING_PILOT_EMAIL,preapproval_plan_id:env.MP_PLAN_ID,limit:'100',offset:String(page*100)});
      const response=await fetch('https://api.mercadopago.com/preapproval/search?'+params,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.MP_ACCESS_TOKEN,Accept:'application/json'}});
      if(!response.ok)throw Error('provider_http_'+response.status);
      const data=await response.json();
      if(!Array.isArray(data.results)||!Number.isSafeInteger(data.paging?.total)||data.paging.total<0||data.paging.total>500||(total!==null&&total!==data.paging.total))throw Error('invalid_pagination');
      total=data.paging.total;
      for(const item of data.results){
        if(!item||typeof item.id!=='string'||seen.has(item.id))throw Error('invalid_or_duplicate_item');
        seen.add(item.id);
        // The API filters by payer and plan, but independently verify ownership fields.
        if(item.external_reference===env.BILLING_PILOT_USER_ID&&item.preapproval_plan_id===env.MP_PLAN_ID)found.push(item);
      }
      if(seen.size===total)break;
      if(!data.results.length)throw Error('incomplete_pagination');
    }
    if(seen.size!==total)throw Error('incomplete_pagination');
    const statuses={};
    for(const item of found){const status=typeof item.status==='string'?item.status:'unknown';statuses[status]=(statuses[status]||0)+1;}
    console.log(JSON.stringify({outcome:'verified_read_only',provider_results:total,matched_pilot:found.length,statuses,decision:found.length===0?'no_matching_subscription_found':found.length===1?'inspect_existing_subscription_before_retry':'manual_reconciliation_required'}));
  }catch(e){error(/^provider_http_\d+$/.test(e.message)?e.message:'provider_query_failed_or_incomplete');}
  finally{restore();}
}
