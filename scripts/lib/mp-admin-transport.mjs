import * as http from 'node:http';

// Never copy raw error messages, proxy URLs, certificate paths or headers to output.
export class TransportError extends Error {
  constructor(code,message,diagnostics={}) {super(message);this.code=code;this.diagnostics=diagnostics;}
}
export function proxySettings(env){
  const fallback=env.all_proxy||env.ALL_PROXY;
  const httpProxy=env.http_proxy||env.HTTP_PROXY||fallback;
  const httpsProxy=env.https_proxy||env.HTTPS_PROXY||fallback;
  const settings={};
  for(const [key,value] of [['HTTP_PROXY',httpProxy],['HTTPS_PROXY',httpsProxy]]){
    if(!value)continue;
    let u;try{u=new URL(value)}catch{throw new TransportError('proxy_invalid','Configuração de proxy inválida. Confira a URL sem compartilhar seu valor.');}
    if(!['http:','https:'].includes(u.protocol)||!u.hostname||u.pathname!=='/'||u.search||u.hash)throw new TransportError('proxy_unsupported','Use um proxy HTTP/HTTPS aprovado; SOCKS e URLs com caminho/query não são suportados.');
    settings[key]=value;
  }
  const noProxy=env.no_proxy||env.NO_PROXY;
  if(noProxy)settings.NO_PROXY=noProxy;
  return settings;
}
export function configureAdminNetwork(env=process.env,{setProxy=http.setGlobalProxyFromEnv}={}){
  if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new TransportError('unsafe_tls_configuration','Verificação TLS desativada no ambiente. Remova NODE_TLS_REJECT_UNAUTHORIZED=0; configure uma CA confiável.');
  const settings=proxySettings(env);
  if(!settings.HTTP_PROXY&&!settings.HTTPS_PROXY)return ()=>{};
  if(typeof setProxy!=='function')throw new TransportError('proxy_runtime_unsupported','Proxy automático requer Node 24.14 ou superior. Atualize o Node; não desative TLS para contornar a falha.');
  try{return setProxy(settings)}catch{throw new TransportError('proxy_invalid','Não foi possível inicializar o proxy. Confira a configuração de rede sem expor credenciais.');}
}
const DNS=new Set(['EAI_AGAIN','ENOTFOUND']);
const TLS=new Set(['SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID']);
const TIMEOUT=new Set(['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']);
const CONNECTION=new Set(['ECONNREFUSED','ECONNRESET','ENETUNREACH','EHOSTUNREACH','UND_ERR_SOCKET']);
export function networkFailure(error,env=process.env,stage='network'){
  const nodes=[],queue=[error],seen=new Set();
  while(queue.length&&nodes.length<20){const e=queue.shift();if(!e||typeof e!=='object'||seen.has(e))continue;seen.add(e);nodes.push(e);queue.push(e.cause);if(Array.isArray(e.errors))queue.push(...e.errors.slice(0,10));}
  const diagnostics={node:process.versions.node,extra_ca_configured:!!env.NODE_EXTRA_CA_CERTS,no_proxy_configured:!!(env.no_proxy||env.NO_PROXY),system_ca_requested:env.NODE_USE_SYSTEM_CA==='1'||process.execArgv.includes('--use-system-ca')||/(^|\s)--use-system-ca(\s|$)/.test(env.NODE_OPTIONS||''),proxy_configured:!!(env.https_proxy||env.HTTPS_PROXY||env.http_proxy||env.HTTP_PROXY||env.all_proxy||env.ALL_PROXY),stage};
  // Undici describes a rejected CONNECT this way; extract only the HTTP number.
  for(const e of nodes){const match=typeof e.message==='string'&&/^Proxy response \(([1-5]\d\d)\)/.exec(e.message);if(match)return new TransportError('proxy_rejected','O proxy recusou o túnel HTTPS. Confira autorização/regras de saída para api.mercadopago.com; isto não comprova token inválido.',{...diagnostics,proxy_http_status:Number(match[1])});}
  for(const codes of [TLS,DNS,TIMEOUT,CONNECTION]){
    const item=nodes.find(e=>codes.has(e.code));if(!item)continue;
    const extra={...diagnostics,network_code:item.code};
    if(codes===TLS)return new TransportError('tls_error','Node não validou o certificado. Confira a cadeia/validade; use --use-system-ca ou uma CA aprovada via NODE_EXTRA_CA_CERTS quando necessário. Não desative TLS.',extra);
    if(codes===DNS)return new TransportError('dns_error','Falha de resolução DNS. Compare proxy/NO_PROXY, VPN e acesso de rede do Node e do curl.',extra);
    if(codes===TIMEOUT)return new TransportError('network_timeout','Tempo limite na conexão HTTPS. Confira proxy, firewall e conectividade.',extra);
    return new TransportError('connection_error','Conexão HTTPS recusada ou interrompida. Confira rede, proxy, VPN e firewall.',extra);
  }
  if(nodes.some(e=>['TimeoutError','AbortError'].includes(e.name)))return new TransportError('network_timeout','A consulta HTTPS foi interrompida ou atingiu o tempo limite.',diagnostics);
  return new TransportError('network_error','Falha de transporte HTTPS. Confira a configuração de proxy e confiança de certificados do Node; nenhum token foi validado por esta falha.',diagnostics);
}
export async function networkProbe(env=process.env,{fetchImpl=fetch}={}){
  let r;try{r=await fetchImpl('https://api.mercadopago.com/preapproval_plan/search?limit=1',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000)})}
  catch(error){throw networkFailure(error,env,'unauthenticated_probe');}
  await r.body?.cancel();
  return {outcome:'http_response',http_status:r.status,credential_sent:false,node:process.versions.node,proxy_configured:!!(env.https_proxy||env.HTTPS_PROXY||env.http_proxy||env.HTTP_PROXY||env.all_proxy||env.ALL_PROXY)};
}
