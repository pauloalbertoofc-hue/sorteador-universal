// Production plan creation is an explicit, one-shot administrative operation.
// Default is dry-run. Never print credentials, response bodies, or checkout URLs.
import {adminClient,compatibility,EXPECTED,safeError,AdminError} from './lib/mp-plan-admin.mjs';
import {configureAdminNetwork,networkFailure} from './lib/mp-admin-transport.mjs';
const fail=(code,message)=>{throw new AdminError(code,message)};
const planId=/^[a-f0-9]{32}$/i;
const expectedSeller='2175387641';
const env=process.env;
const create=process.argv.includes('--create');
const args=process.argv.slice(2);
if(args.some(x=>x!=='--create')){console.error(JSON.stringify({code:'invalid_arguments',message:'Use sem argumentos para simular ou --create para solicitar a criação.'}));process.exit(1)}
let restore=()=>{};
try{
  if(env.MP_ENVIRONMENT!=='production')fail('environment_required','Selecione explicitamente MP_ENVIRONMENT=production.');
  if(env.BILLING_ENABLED==='true')fail('billing_must_be_disabled','Desative BILLING_ENABLED antes desta operação administrativa.');
  const backUrl='https://sorteador-universal.paulo-alberto-ofc.workers.dev/';
  const body={reason:EXPECTED.name,auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:4.9,currency_id:'BRL'},back_url:backUrl};
  restore=configureAdminNetwork(env);
  const client=adminClient(env);
  const seller=await client.identity();
  if(seller.id!==expectedSeller)fail('wrong_seller','Credencial pertence a outro vendedor; operação interrompida.');
  // Check catalog before any POST. An incomplete listing must fail closed.
  const ids=new Set();let offset=0,total=null;
  for(let page=0;page<10;page++){
    const data=await client.get('/preapproval_plan/search?limit=50&offset='+offset);
    const p=data.paging;
    if(!p||!Number.isInteger(p.total)||p.total<0||p.total>500||p.offset!==offset||!Number.isInteger(p.limit)||p.limit<1||p.limit>50||!Array.isArray(data.results)||data.results.length>p.limit||(total!==null&&total!==p.total))fail('incomplete_catalog','Não foi possível validar o catálogo completo.');
    total=p.total;
    for(const item of data.results){if(!planId.test(item?.id||'')||ids.has(item.id))fail('incomplete_catalog','Catálogo contém IDs inválidos ou repetidos.');ids.add(item.id)}
    offset=ids.size;
    if(offset===total)break;
    if(!data.results.length||offset>total||page===9)fail('incomplete_catalog','Catálogo incompleto.');
  }
  let existing=0;
  for(const id of ids){
    const plan=await client.get('/preapproval_plan/'+id);
    if(compatibility(plan,seller,id).ok)existing++;
  }
  if(existing)fail('plan_already_exists','Já existe plano compatível nesta aplicação; criação bloqueada para evitar duplicidade.');
  if(!create){console.log(JSON.stringify({outcome:'dry_run',seller_verified:true,environment:'production',application_expected:EXPECTED.application,existing_compatible_plans:0,plan:{reason:body.reason,amount:4.9,currency:'BRL',frequency:'monthly',back_url:backUrl},next:'Execute --create somente após revisar este resumo.'}));}
  else{
    if(env.MP_CREATE_CONFIRM!=='CRIAR-PLANO-490')fail('confirmation_required','Defina MP_CREATE_CONFIRM=CRIAR-PLANO-490 para autorizar um único POST.');
    let response;
    try{response=await fetch('https://api.mercadopago.com/preapproval_plan',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.MP_ACCESS_TOKEN,accept:'application/json','content-type':'application/json'},body:JSON.stringify(body)})}
    catch(error){throw networkFailure(error,env,'create_request')}
    if(!response.ok)fail('create_http_error','Mercado Pago recusou a criação (HTTP '+response.status+'). Nenhuma repetição automática será feita.');
    let result;
    try{result=await response.json()}catch{fail('create_unknown','Resposta de criação inválida. Consulte o catálogo antes de qualquer nova tentativa.')}
    if(!planId.test(result?.id||''))fail('create_unknown','Criação sem ID válido. Consulte o catálogo antes de repetir.');
    const detail=await client.get('/preapproval_plan/'+result.id);
    const validation=compatibility(detail,seller,result.id);
    if(!validation.ok)fail('created_but_unverified','Plano criado, porém incompatível ('+validation.code+'). Não repita a criação; confira o catálogo e o novo ID no painel.');
    console.log(JSON.stringify({outcome:'created_verified',preapproval_plan_id:result.id,environment:'production',application_verified:true,seller_verified:true}));
  }
}catch(error){console.error(JSON.stringify(safeError(error)));process.exitCode=1}
finally{restore()}
