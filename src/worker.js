const enc = new TextEncoder();
const json = (value, status=200, headers={}) => new Response(JSON.stringify(value), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const fail=(error,status=400)=>json({error},status);
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
const random=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
async function sha(s){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))))}
async function pbkdf(password,salt){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:310000,hash:'SHA-256'},key,256)))}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0}
function sessionCookie(value,age){return `su_session=${value}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`}
async function readBody(req){const text=await req.text();if(text.length>12000)throw Error('payload_too_large');return JSON.parse(text)}
async function auth(req,env){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)su_session=([0-9a-f]{64})/)?.[1];if(!token)return null;return env.DB.prepare('SELECT users.id, users.email, sessions.token_hash FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?').bind(await sha(token),Date.now()).first()}
async function createSession(env,id){const token=random(32);await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(token),id,Date.now()+30*86400000).run();return sessionCookie(token,30*86400)}
function originOk(req){const origin=req.headers.get('origin');return !!origin&&origin===new URL(req.url).origin}
async function mpGet(env,id){const r=await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(id)}`,{headers:{authorization:`Bearer ${env.MP_ACCESS_TOKEN}`}});if(!r.ok)throw Error('mp_fetch_failed');return r.json()}
async function syncSubscription(env,sub){const provider=String(sub.id||'');const uid=String(sub.external_reference||'');if(!/^[a-f0-9-]{36}$/i.test(uid)||!provider)return false;const row=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(uid).first();if(!row)return false;
 const prior=await env.DB.prepare('SELECT mp_subscription_id FROM subscriptions WHERE user_id=?').bind(uid).first();if(prior?.mp_subscription_id&&prior.mp_subscription_id!==provider)return false;
 const state=['authorized','pending','paused','cancelled'].includes(sub.status)?sub.status:'inactive';
 await env.DB.prepare(`INSERT INTO subscriptions(id,user_id,mp_subscription_id,mp_plan_id,status,amount_cents,currency,current_period_end) VALUES(?,?,?,?,?,490,'BRL',NULL) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,mp_plan_id=excluded.mp_plan_id,updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(),uid,provider,sub.preapproval_plan_id||null,state).run();return true}
async function api(req,env,url){const path=url.pathname,method=req.method;
 if(!env.DB)return fail('Banco D1 não conectado.',503);
 if(!['GET','POST','DELETE'].includes(method))return fail('Método não permitido',405);
 if(method!=='GET'&&!originOk(req)&&path!=='/api/webhooks/mercadopago')return fail('Origem inválida',403);
 if(path==='/api/health'&&method==='GET')return json({ok:true,version:'2.0.0'});
 if(path==='/api/register'&&method==='POST'){
  const {email,password}=await readBody(req);const e=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)||e.length>254||typeof password!=='string'||password.length<10||password.length>128)return fail('E-mail ou senha inválidos (mínimo 10 caracteres).');
  const salt=random(16),hash=await pbkdf(password,salt),id=crypto.randomUUID();try{await env.DB.prepare('INSERT INTO users(id,email,password_hash) VALUES(?,?,?)').bind(id,e,`pbkdf2$${salt}$${hash}`).run()}catch{return fail('E-mail já cadastrado',409)}return json({ok:true},201,{'set-cookie':await createSession(env,id)});
 }
 if(path==='/api/login'&&method==='POST'){
  const {email,password}=await readBody(req);if(typeof password!=='string'||password.length>128)return fail('Credenciais inválidas',401);const user=await env.DB.prepare('SELECT id,password_hash FROM users WHERE email=?').bind(String(email||'').trim().toLowerCase()).first();if(!user||!user.password_hash?.startsWith('pbkdf2$'))return fail('Credenciais inválidas',401);const [,salt,hash]=user.password_hash.split('$');if(!equal(await pbkdf(password,salt),hash))return fail('Credenciais inválidas',401);return json({ok:true},200,{'set-cookie':await createSession(env,user.id)});
 }
 if(path==='/api/logout'&&method==='POST'){const user=await auth(req,env);if(user)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();return json({ok:true},200,{'set-cookie':sessionCookie('',0)})}
 const user=await auth(req,env);
 if(path==='/api/me'&&method==='GET'){
  if(!user)return json({user:null,subscription:{active:false}});
  const sub=await env.DB.prepare('SELECT status,mp_subscription_id FROM subscriptions WHERE user_id=?').bind(user.id).first();let status=sub?.status||'inactive';
  // Consulta o provedor antes de conceder acesso; falha = sem acesso Pro, nunca acesso presumido.
  if(sub?.mp_subscription_id&&env.MP_ACCESS_TOKEN){try{const remote=await mpGet(env,sub.mp_subscription_id);if(remote.id===sub.mp_subscription_id&&remote.external_reference===user.id){await syncSubscription(env,remote);status=remote.status}else status='inactive'}catch{status='unverified'}}else if(status==='authorized')status='unverified';
  return json({user:{id:user.id,email:user.email},subscription:{active:status==='authorized',status}});
 }
 if(path==='/api/checkout'&&method==='POST'){
  if(!user)return fail('Faça login antes de assinar',401);if(!env.MP_ACCESS_TOKEN||!env.MP_PLAN_ID||!env.PUBLIC_SITE_URL)return fail('Pagamento ainda não configurado',503);
  const existing=await env.DB.prepare('SELECT mp_subscription_id FROM subscriptions WHERE user_id=?').bind(user.id).first();if(existing?.mp_subscription_id){const remote=await mpGet(env,existing.mp_subscription_id);await syncSubscription(env,remote);if(remote.status==='authorized')return fail('Você já tem uma assinatura ativa',409);if(remote.status==='pending'&&remote.init_point)return json({checkout_url:remote.init_point});if(!['cancelled','paused'].includes(remote.status))return fail('Consulte sua assinatura antes de tentar novamente',409)}
  const res=await fetch('https://api.mercadopago.com/preapproval',{method:'POST',headers:{authorization:`Bearer ${env.MP_ACCESS_TOKEN}`,'content-type':'application/json','X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({preapproval_plan_id:env.MP_PLAN_ID,reason:'Sorteador Universal Pro',external_reference:user.id,payer_email:user.email,back_url:env.PUBLIC_SITE_URL,status:'pending'})});const data=await res.json().catch(()=>({}));if(!res.ok||!data.id||!data.init_point)return fail('Não foi possível iniciar assinatura',502);
  await env.DB.prepare(`INSERT INTO subscriptions(id,user_id,mp_subscription_id,mp_plan_id,status,amount_cents,currency) VALUES(?,?,?,?, 'pending',490,'BRL') ON CONFLICT(user_id) DO UPDATE SET mp_subscription_id=excluded.mp_subscription_id,mp_plan_id=excluded.mp_plan_id,status='pending',updated_at=CURRENT_TIMESTAMP`).bind(crypto.randomUUID(),user.id,String(data.id),env.MP_PLAN_ID).run();return json({checkout_url:data.init_point});
 }
 if(path==='/api/webhooks/mercadopago'&&method==='POST'){
  if(!env.MP_ACCESS_TOKEN||!env.MP_WEBHOOK_SECRET)return fail('Webhook indisponível',503);const sig=req.headers.get('x-signature')||'',rid=req.headers.get('x-request-id')||'';const pairs=Object.fromEntries(sig.split(',').map(x=>x.trim().split('=')).filter(x=>x.length===2));const ts=pairs.ts,v1=pairs.v1;
  if(!ts||!v1||!rid||!/^[0-9]+$/.test(ts)||Math.abs(Date.now()-Number(ts)*1000)>300000)return fail('Assinatura inválida',401);
  const payload=await readBody(req),id=String(url.searchParams.get('data.id')||payload?.data?.id||'').toLowerCase();if(!id||id.length>120)return fail('Evento inválido',400);
  const msg=`id:${id};request-id:${rid};ts:${ts};`;const key=await crypto.subtle.importKey('raw',enc.encode(env.MP_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const expected=hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(msg))));if(!equal(expected,v1.toLowerCase()))return fail('Assinatura inválida',401);
  const type=String(payload?.type||payload?.topic||url.searchParams.get('type')||'');if(!['subscription_preapproval','preapproval'].includes(type))return json({ok:true,ignored:true});const sub=await mpGet(env,id);if(String(sub.id).toLowerCase()!==id)return fail('Assinatura não confere',400);await syncSubscription(env,sub);return json({ok:true});
 }
 if(path==='/api/lists'&&method==='GET'){
  if(!user)return fail('Não autenticado',401);const sub=await env.DB.prepare('SELECT status FROM subscriptions WHERE user_id=?').bind(user.id).first();if(sub?.status!=='authorized')return fail('Recurso Pro',403);const rows=await env.DB.prepare('SELECT id,name,list_type,items_json FROM saved_lists WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(user.id).all();return json({lists:rows.results});
 }
 if(path==='/api/lists'&&method==='POST'){
  if(!user)return fail('Não autenticado',401);const sub=await env.DB.prepare('SELECT status FROM subscriptions WHERE user_id=?').bind(user.id).first();if(sub?.status!=='authorized')return fail('Recurso Pro',403);const b=await readBody(req);if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!Array.isArray(b.items)||b.items.length>5000)return fail('Lista inválida');const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO saved_lists(id,user_id,name,list_type,items_json) VALUES(?,?,?,?,?)').bind(id,user.id,b.name.trim(),String(b.list_type||'names').slice(0,30),JSON.stringify(b.items)).run();return json({id},201);
 }
 return fail('Rota não encontrada',404);
}
export default {async fetch(req,env){const url=new URL(req.url);if(url.pathname.startsWith('/api/')){try{return await api(req,env,url)}catch(e){return fail('Erro interno ao processar solicitação',500)}}return env.ASSETS.fetch(req)}};
