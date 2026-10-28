import {TransportError,networkFailure} from './mp-admin-transport.mjs';
const API = 'https://api.mercadopago.com';
const PLAN_ID = /^[a-f0-9]{32}$/i;
export const EXPECTED = Object.freeze({name: 'Sorteador Universal Pro', reference: 'SORTEADOR-PRO-MENSAL', application: '4465213801165623'});
export class AdminError extends Error {
  constructor(code, message, diagnostics) {super(message);this.code=code;if(diagnostics)this.diagnostics=diagnostics;}
}
const abort = (code, message, diagnostics) => {throw new AdminError(code,message,diagnostics);};
const validId = value => (typeof value==='string'&&/^[1-9]\d*$/.test(value))||(typeof value==='number'&&Number.isSafeInteger(value)&&value>0);
const normalized = value => typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR'):'';
export function adminClient(env, fetchImpl=fetch) {
  if(!env.MP_ACCESS_TOKEN?.trim())abort('missing_credentials','MP_ACCESS_TOKEN ausente. Configure a credencial com segurança; não a envie ao chat.');
  const environment=env.MP_ENVIRONMENT,deadline=Date.now()+120000;
  if(!['test','production'].includes(environment))abort('missing_environment','Defina MP_ENVIRONMENT=test ou production. A ferramenta executa somente GET em ambos.');
  if(environment==='production'&&env.MP_ACCESS_TOKEN.startsWith('TEST-'))abort('environment_mismatch','Credencial de teste incompatível com a seleção de produção.');
  async function get(path){
    const stage=path==='/users/me'?'identity':path.startsWith('/preapproval_plan/search')?'search':'plan_detail';
    if(!/^\/users\/me$|^\/preapproval_plan\/search\?limit=50&offset=\d+$|^\/preapproval_plan\/[a-f0-9]{32}$/i.test(path))abort('unsafe_path','Operação administrativa não permitida.');
    if(Date.now()>=deadline)abort('deadline_exceeded','Limite de dois minutos atingido; nenhum ID foi selecionado.');
    let response;
    try{response=await fetchImpl(API+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(Math.min(8000,Math.max(1,deadline-Date.now()))),headers:{authorization:`Bearer ${env.MP_ACCESS_TOKEN}`,accept:'application/json'}})}
    catch(error){
      // Errors raised by the fetch adapter are sanitized and classified by
      // networkFailure, including unknown errors without a recognized code.
      // Never expose raw exception messages or credentials.
      throw networkFailure(error,env,stage+'_request');
    }
    if([401,403].includes(response.status))abort('authentication_denied','Consulta bloqueada (HTTP 401/403). Confira credencial, permissão, ambiente e política de rede.',{stage,http_status:response.status});
    if(response.status===404)abort('not_visible','Recurso não visível para essa credencial. Isso não prova que esteja ausente em outra conta ou ambiente.');
    if(!response.ok)abort('api_error',`Mercado Pago indisponível ou consulta recusada (HTTP ${response.status}).`);
    let data;
    try{data=await response.json()}
    catch(error){
      if(error instanceof SyntaxError)abort('incomplete_response','Resposta JSON inválida do provedor.',{stage:stage+'_json'});
      throw networkFailure(error,env,stage+'_body');
    }
    if(!data||typeof data!=='object'||Array.isArray(data))abort('incomplete_response','Resposta inválida ou incompleta do provedor.');
    return data;
  }
  async function identity(){
    const seller=await get('/users/me');
    if(!validId(seller.id)||!Array.isArray(seller.tags)||seller.tags.some(tag=>typeof tag!=='string'))abort('incomplete_identity','Identidade incompleta; não foi possível conferir o ambiente da conta.');
    const testUser=seller.tags.includes('test_user');
    if((environment==='test')!==testUser)abort('environment_mismatch','Tipo de conta incompatível com MP_ENVIRONMENT. Nenhum ID foi selecionado.');
    return {id:String(seller.id),environment,testUser};
  }
  return {get,identity,environment};
}
export function compatibility(plan,seller,expectedId){
  if(!PLAN_ID.test(plan?.id||'')||(expectedId&&plan.id!==expectedId)||!validId(plan.collector_id)||!validId(plan.application_id)||typeof plan.reason!=='string'||!plan.auto_recurring||typeof plan.status!=='string')return {ok:false,code:'incomplete_plan'};
  if(String(plan.collector_id)!==seller.id)return {ok:false,code:'wrong_seller'};
  if(String(plan.application_id)!==EXPECTED.application)return {ok:false,code:'wrong_application'};
  if(normalized(plan.reason)!==normalized(EXPECTED.name))return {ok:false,code:'wrong_name'};
  const hasReference=Object.hasOwn(plan,'external_reference')&&plan.external_reference!=null;
  if(hasReference&&plan.external_reference!==EXPECTED.reference)return {ok:false,code:'wrong_reference'};
  if(Object.hasOwn(plan,'live_mode')&&(typeof plan.live_mode!=='boolean'||plan.live_mode!==(seller.environment==='production')))return {ok:false,code:'environment_mismatch'};
  const a=plan.auto_recurring;
  if(plan.status!=='active'||a.frequency!==1||a.frequency_type!=='months'||a.currency_id!=='BRL'||typeof a.transaction_amount!=='number'||a.transaction_amount!==4.9||a.free_trial!=null||!([undefined,null].includes(a.repetitions))||a.end_date!=null||!([undefined,null,false].includes(a.billing_day_proportional)))return {ok:false,code:'commercial_mismatch'};
  return {ok:true,reference_checked:hasReference,live_mode_checked:Object.hasOwn(plan,'live_mode')};
}
export async function findPlan(env,{fetchImpl=fetch}={}){
  const client=adminClient(env,fetchImpl),seller=await client.identity();
  const summaries=[],seen=new Set();let total;
  for(let page=0;page<10;page++){
    const offset=summaries.length, data=await client.get(`/preapproval_plan/search?limit=50&offset=${offset}`);
    const p=data.paging;
    if(!p||!Number.isInteger(p.total)||p.total<0||p.total>500||p.offset!==offset||!Number.isInteger(p.limit)||p.limit<1||p.limit>50||!Array.isArray(data.results)||data.results.length>p.limit||(total!==undefined&&total!==p.total))abort('pagination_incomplete','Paginação incompleta, inconsistente ou acima de 500 planos; nenhum ID foi selecionado.');
    total=p.total;
    for(const item of data.results){
      if(!PLAN_ID.test(item?.id||'')||seen.has(item.id))abort('pagination_incomplete','Identificadores incompletos ou repetidos na paginação; nenhum ID foi selecionado.');
      seen.add(item.id);summaries.push(item.id);
    }
    if(summaries.length===total)break;
    if(!data.results.length||summaries.length>total||page===9)abort('pagination_incomplete','Não foi possível completar a pesquisa; nenhum ID foi selecionado.');
  }
  const matches=[],reasons={};let incompatible=0;
  // Fetch every detail: search summaries may omit name, reference or commercial fields.
  for(const id of summaries){
    const plan=await client.get('/preapproval_plan/'+id);
    if(plan.id!==id||typeof plan.reason!=='string')abort('incomplete_plan','Detalhe de plano incompleto; identificação inequívoca não é possível.');
    const check=compatibility(plan,seller,id);
    if(check.code==='incomplete_plan')abort('incomplete_plan','Detalhe de plano incompleto; identificação inequívoca não é possível.');
    if(check.ok)matches.push({id,reference_checked:check.reference_checked});
    else if(normalized(plan.reason)===normalized(EXPECTED.name)){incompatible++;reasons[check.code]=(reasons[check.code]||0)+1;}
  }
  if(matches.length>1)return {outcome:'ambiguous',environment:client.environment,candidates:matches.length,scanned:summaries.length};
  if(!matches.length)return {outcome:'not_found',environment:client.environment,scanned:summaries.length,incompatible,incompatible_reasons:reasons};
  // Re-read the selected candidate before reporting its identifier.
  const chosen=matches[0],check=compatibility(await client.get('/preapproval_plan/'+chosen.id),seller,chosen.id);
  if(!check.ok)abort('plan_changed','O candidato mudou ou ficou inconsistente durante a consulta; nenhum ID foi selecionado.');
  return {outcome:'found',environment:client.environment,preapproval_plan_id:chosen.id,environment_evidence:'account_tags',live_mode_checked:check.live_mode_checked,reference_checked:check.reference_checked,scanned:summaries.length};
}
export async function verifyPlan(env,{fetchImpl=fetch}={}){
  if(!PLAN_ID.test(env.MP_PLAN_ID||''))abort('missing_plan','Defina o verdadeiro MP_PLAN_ID; Application ID, referência e URL pública não são IDs de plano.');
  const client=adminClient(env,fetchImpl),seller=await client.identity();
  const check=compatibility(await client.get('/preapproval_plan/'+env.MP_PLAN_ID),seller,env.MP_PLAN_ID);
  if(!check.ok)abort(check.code,'Plano incompatível ou incompleto: confira vendedor, aplicação, nome/referência, ambiente, BRL 4,90 mensal, status, trial e duração.');
  return {outcome:'verified',environment:client.environment,environment_evidence:'account_tags',live_mode_checked:check.live_mode_checked,reference_checked:check.reference_checked};
}
export function safeError(error){
  return error instanceof TransportError?{code:error.code,message:error.message,diagnostics:error.diagnostics}:error instanceof AdminError?{code:error.code,message:error.message,...(error.diagnostics?{diagnostics:error.diagnostics}:{})}:{code:'unexpected_error',message:'Consulta interrompida. Não compartilhe a credencial nem a resposta bruta do provedor.'};
}
