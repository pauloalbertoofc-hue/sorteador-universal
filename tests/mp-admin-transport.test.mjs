import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configureAdminNetwork,proxySettings,networkFailure,networkProbe} from '../scripts/lib/mp-admin-transport.mjs';
import {safeError,EXPECTED} from '../scripts/lib/mp-plan-admin.mjs';
const TOKEN='synthetic-private-token',PROXY_PASSWORD='synthetic-proxy-password',ID='c'.repeat(32);
const rendered=error=>JSON.stringify(safeError(error));
const safe=error=>{const text=rendered(error);assert.ok(!text.includes(TOKEN));assert.ok(!text.includes(PROXY_PASSWORD));assert.ok(!text.includes('private@example.test'));return true;};

test('native proxy initialization respects lowercase precedence, ALL_PROXY fallback and NO_PROXY, then restores',()=>{
 let settings,restored=false;
 const restore=configureAdminNetwork({HTTP_PROXY:'http://upper.invalid:80',http_proxy:'http://lower.invalid:80',ALL_PROXY:'http://fallback.invalid:80',NO_PROXY:'localhost,127.0.0.1'}, {setProxy:value=>{settings=value;return ()=>{restored=true}}});
 assert.equal(settings.HTTP_PROXY,'http://lower.invalid:80');assert.equal(settings.HTTPS_PROXY,'http://fallback.invalid:80');assert.equal(settings.NO_PROXY,'localhost,127.0.0.1');restore();assert.equal(restored,true);
});
test('invalid and SOCKS proxies fail closed without printing their URL or password',()=>{
 for(const proxy of [`https://user:${PROXY_PASSWORD}@/bad`,`socks5://user:${PROXY_PASSWORD}@example.test:1080`])assert.throws(()=>proxySettings({ALL_PROXY:proxy}),error=>safe(error)&&['proxy_invalid','proxy_unsupported'].includes(error.code));
});
test('old runtime with a proxy gets an actionable error, while direct mode needs no proxy API',()=>{
 assert.throws(()=>configureAdminNetwork({HTTPS_PROXY:'http://proxy.test:80'},{setProxy:null}),e=>e.code==='proxy_runtime_unsupported');
 assert.equal(typeof configureAdminNetwork({},{setProxy:null}),'function');
});
test('TLS verification cannot be disabled through the administrative runtime',()=>{
 assert.throws(()=>configureAdminNetwork({NODE_TLS_REJECT_UNAUTHORIZED:'0'}),e=>e.code==='unsafe_tls_configuration');
});
test('DNS aggregate errors expose only an allowlisted diagnostic code',()=>{
 const cause=new AggregateError([Object.assign(Error(TOKEN),{code:'EAI_AGAIN'}),Error('private@example.test')]);
 const error=networkFailure(new TypeError('fetch failed',{cause}),{},'search');assert.equal(error.code,'dns_error');assert.equal(error.diagnostics.network_code,'EAI_AGAIN');safe(error);
});
test('certificate failures have safe trust-store guidance instead of raw issuer/URL data',()=>{
 const e=networkFailure(new Error(TOKEN,{cause:Object.assign(Error('private@example.test'),{code:'SELF_SIGNED_CERT_IN_CHAIN'})}));
 assert.equal(e.code,'tls_error');assert.match(e.message,/NODE_EXTRA_CA_CERTS/);safe(e);
});
test('timeouts and refused connections are distinct from credentials',()=>{
 assert.equal(networkFailure({name:'TimeoutError',message:TOKEN}).code,'network_timeout');
 assert.equal(networkFailure({cause:{code:'UND_ERR_CONNECT_TIMEOUT',message:TOKEN}}).code,'network_timeout');
 const e=networkFailure({cause:{code:'ECONNREFUSED',message:TOKEN}});assert.equal(e.code,'connection_error');safe(e);
});
test('CONNECT rejections expose only numeric proxy status, not proxy credentials',()=>{
 for(const status of [403,407]){
  const e=networkFailure({cause:{cause:{code:'UND_ERR_ABORTED',message:`Proxy response (${status}) !== 200 when HTTP Tunneling ${TOKEN} ${PROXY_PASSWORD}`}}},{HTTPS_PROXY:`http://user:${PROXY_PASSWORD}@proxy.test`},'identity');
  assert.equal(e.code,'proxy_rejected');assert.equal(e.diagnostics.proxy_http_status,status);assert.equal(e.diagnostics.proxy_configured,true);safe(e);
 }
});
test('network probe deliberately sends no Authorization, even if token exists',async()=>{
 const result=await networkProbe({MP_ACCESS_TOKEN:TOKEN},{fetchImpl:async(url,init)=>{
  assert.equal(url,'https://api.mercadopago.com/preapproval_plan/search?limit=1');assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.equal(init.headers,undefined);assert.equal(init.body,undefined);
  return new Response(JSON.stringify({private:TOKEN}),{status:401});
 }});
 assert.equal(result.http_status,401);assert.equal(result.credential_sent,false);assert.ok(!JSON.stringify(result).includes(TOKEN));
});
function childEnv(proxy){
 const env={...process.env,MP_ACCESS_TOKEN:TOKEN,MP_ENVIRONMENT:'production',HTTPS_PROXY:proxy,HTTP_PROXY:proxy};
 for(const name of ['https_proxy','http_proxy','all_proxy','ALL_PROXY','NO_PROXY','no_proxy','NODE_USE_ENV_PROXY','NODE_TLS_REJECT_UNAUTHORIZED'])delete env[name];
 return env;
}
async function run(script,env){
 const child=spawn(process.execPath,[script],{env,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk});child.stderr.on('data',chunk=>{stderr+=chunk});
 const timer=setTimeout(()=>child.kill(),15000);
 try{return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}))})}finally{clearTimeout(timer)}
}
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server.address().port;}
async function close(server){await new Promise(resolve=>server.close(resolve));}

test('real child CLI uses configured proxy and reports rejected CONNECT without exposing any credential',async()=>{
 const proxy=http.createServer(),targets=[];
 proxy.on('connect',(req,socket)=>{targets.push(req.url);assert.equal(req.headers.authorization,undefined);socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')});
 const port=await listen(proxy);
 try{
  const result=await run('scripts/check-mp-network.mjs',childEnv(`http://127.0.0.1:${port}`));
  assert.equal(result.code,1);assert.match(result.stderr,/proxy_rejected/);assert.match(result.stderr,/403/);assert.ok(!result.stderr.includes(TOKEN));assert.ok(!result.stderr.includes(PROXY_PASSWORD));assert.deepEqual(targets,['api.mercadopago.com:443']);
 }finally{await close(proxy)}
});

test('real CLI finds the unique plan through a TLS-verified local CONNECT proxy; bearer only reaches the origin',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mp-proxy-tls-'));let origin,proxy;
 const tunnels=new Set(),originCalls=[],connects=[];
 try{
  // Ephemeral test CA only. No private key is committed; validation stays enabled.
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=api.mercadopago.com','-addext','subjectAltName=DNS:api.mercadopago.com','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem')],{stdio:'ignore'});
  origin=https.createServer({key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))},(req,res)=>{
   assert.equal(req.method,'GET');assert.equal(req.headers.authorization,`Bearer ${TOKEN}`);originCalls.push(req.url);
   const plan={id:ID,collector_id:123,application_id:EXPECTED.application,reason:EXPECTED.name,status:'active',auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:4.9,currency_id:'BRL'}};
   const data=req.url==='/users/me'?{id:123,tags:[],email:'private@example.test'}:req.url.startsWith('/preapproval_plan/search?')?{paging:{total:1,limit:50,offset:0},results:[{id:ID}]}:plan;
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));
  });
  const originPort=await listen(origin);
  proxy=http.createServer();proxy.on('connect',(req,socket,head)=>{
   connects.push(req.url);assert.equal(req.url,'api.mercadopago.com:443');assert.equal(req.headers.authorization,undefined);
   const upstream=net.connect(originPort,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket)});
   for(const stream of [socket,upstream]){tunnels.add(stream);stream.on('error',()=>stream.destroy());stream.on('close',()=>tunnels.delete(stream));}
  });
  const port=await listen(proxy),env={...childEnv(`http://127.0.0.1:${port}`),NODE_EXTRA_CA_CERTS:join(dir,'cert.pem')};
  const result=await run('scripts/find-mp-plan.mjs',env);
  assert.equal(result.code,0,result.stderr);const line=result.stdout.trim().split('\n').at(-1),data=JSON.parse(line);assert.equal(data.outcome,'found');assert.equal(data.preapproval_plan_id,ID);
  assert.ok(originCalls.includes('/users/me'));assert.ok(originCalls.includes('/preapproval_plan/search?limit=50&offset=0'));assert.equal(originCalls.filter(p=>p==='/preapproval_plan/'+ID).length,2);
  assert.ok(connects.length>0);for(const output of [result.stdout,result.stderr]){assert.ok(!output.includes(TOKEN));assert.ok(!output.includes('private@example.test'));}
 }finally{for(const stream of tunnels)stream.destroy();if(proxy)await close(proxy);if(origin)await close(origin);await rm(dir,{recursive:true,force:true})}
});

test('body transfer timeout is a transport error, while endpoint HTTP denial identifies its stage',async()=>{
 const {findPlan}=await import('../scripts/lib/mp-plan-admin.mjs');
 const env={MP_ACCESS_TOKEN:TOKEN,MP_ENVIRONMENT:'production'};
 await assert.rejects(findPlan(env,{fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw Object.assign(Error(TOKEN),{code:'UND_ERR_BODY_TIMEOUT'})}})}),e=>e.code==='network_timeout'&&e.diagnostics.stage==='identity_body'&&safe(e));
 await assert.rejects(findPlan(env,{fetchImpl:async()=>new Response('{}',{status:403})}),e=>e.code==='authentication_denied'&&e.diagnostics.http_status===403&&e.diagnostics.stage==='identity'&&safe(e));
});

test('request failure, body failure and invalid JSON have separate sanitized stages',async()=>{
 const {findPlan}=await import('../scripts/lib/mp-plan-admin.mjs');
 const env={MP_ACCESS_TOKEN:TOKEN,MP_ENVIRONMENT:'production'};
 await assert.rejects(findPlan(env,{fetchImpl:async()=>{throw Object.assign(Error(TOKEN),{code:'ENOTFOUND'});}}),e=>e.code==='dns_error'&&e.diagnostics.stage==='identity_request'&&safe(e));
 await assert.rejects(findPlan(env,{fetchImpl:async()=>new Response('not-json',{status:200})}),e=>e.code==='incomplete_response'&&e.diagnostics.stage==='identity_json'&&safe(e));
});
