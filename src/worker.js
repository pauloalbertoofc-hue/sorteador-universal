import {BillingError, subscriptionState, billingInfo, checkout, cancelSubscription, webhook} from './billing.js';
const enc = new TextEncoder();
const json = (value, status=200, headers={}) => new Response(JSON.stringify(value), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const fail=(error,status=400)=>json({error},status);
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
const random=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
async function sha(s){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))))}
async function pbkdf(password,salt){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256)))}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0}
function sessionCookie(value,age){return `su_session=${value}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`}
async function readBody(req){const text=await req.text();if(text.length>12000)throw Error('payload_too_large');return JSON.parse(text)}
async function auth(req,env){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)su_session=([0-9a-f]{64})(?=;|$)/)?.[1];if(!token)return null;return env.DB.prepare('SELECT users.id, users.email, sessions.token_hash FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?').bind(await sha(token),Date.now()).first()}
// Session expiry is Unix time in milliseconds, matching Date.now() in auth().
async function createSession(env,id){const token=random(32);await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(token),id,Date.now()+30*86400000).run();return sessionCookie(token,30*86400)}
function originOk(req){const origin=req.headers.get('origin');return !!origin&&origin===new URL(req.url).origin}
async function api(req,env,url){const path=url.pathname,method=req.method;
 if(!env.DB)return fail('Banco D1 não conectado.',503);
 if(!['GET','POST','DELETE'].includes(method))return fail('Método não permitido',405);
 if(method!=='GET'&&!originOk(req)&&path!=='/api/webhooks/mercadopago')return fail('Origem inválida',403);
 if(path==='/api/health'&&method==='GET')return json({ok:true,version:'2.0.4'});
 if(path==='/api/register'&&method==='POST'){
  const {email,password}=await readBody(req);const e=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)||e.length>254||typeof password!=='string'||password.length<10||password.length>128)return fail('E-mail ou senha inválidos (mínimo 10 caracteres).');
  const salt=random(16),hash=await pbkdf(password,salt),id=crypto.randomUUID();try{
   await env.DB.prepare('INSERT INTO users(id,email,password_hash) VALUES(?,?,?)')
     .bind(id,e,`pbkdf2$${salt}$${hash}`).run();
  }catch(error){
   if (/UNIQUE constraint failed: users.email/i.test(String(error?.message||'')))
     return fail('E-mail já cadastrado',409);
   console.error('[SU_API] Falha no INSERT de users', {type:error?.name||'Error', message:String(error?.message||'').slice(0,250)});
   return fail('Não foi possível concluir o cadastro',500);
  }
  return json({ok:true},201,{'set-cookie':await createSession(env,id)});
 }
 if(path==='/api/login'&&method==='POST'){
  const {email,password}=await readBody(req);if(typeof password!=='string'||password.length>128)return fail('Credenciais inválidas',401);const user=await env.DB.prepare('SELECT id,password_hash FROM users WHERE email=?').bind(String(email||'').trim().toLowerCase()).first();if(!user||!user.password_hash?.startsWith('pbkdf2$'))return fail('Credenciais inválidas',401);const [,salt,hash]=user.password_hash.split('$');if(!equal(await pbkdf(password,salt),hash))return fail('Credenciais inválidas',401);return json({ok:true},200,{'set-cookie':await createSession(env,user.id)});
 }
 if(path==='/api/logout'&&method==='POST'){const user=await auth(req,env);if(user)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();return json({ok:true},200,{'set-cookie':sessionCookie('',0)})}
 const user=await auth(req,env);
 if(path==='/api/me'&&method==='GET'){
  if(!user)return json({user:null,subscription:{active:false}});
  const subscription=await subscriptionState(env,user),billing=await billingInfo(env),now=Date.now();
  // Billing configuration checks may take time; never serialize an expired grant.
  if(subscription.active&&Date.parse(subscription.access_until)<=now){subscription.active=false;subscription.access_status='expired'}
  if(subscription.verified_at)subscription.verified_at=now;
  return json({user:{id:user.id,email:user.email},subscription,billing});
 }
 if(path==='/api/checkout'&&method==='POST'){
  if(!user)return fail('Faça login antes de assinar',401);
  return json(await checkout(env,user));
 }
 if(path==='/api/subscription/cancel'&&method==='POST'){
  if(!user)return fail('Faça login antes de gerenciar sua assinatura',401);
  return json(await cancelSubscription(env,user));
 }
 if(path==='/api/webhooks/mercadopago'&&method==='POST')return json(await webhook(req,env,url));
 if(path==='/api/lists'&&method==='GET'){
  if(!user)return fail('Não autenticado',401);const sub=await subscriptionState(env,user);if(!sub.active)return fail('Recurso Pro',403);const rows=await env.DB.prepare('SELECT id,name,list_type,items_json FROM saved_lists WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(user.id).all();return json({lists:rows.results});
 }
 if(path==='/api/lists'&&method==='POST'){
  if(!user)return fail('Não autenticado',401);const sub=await subscriptionState(env,user);if(!sub.active)return fail('Recurso Pro',403);const b=await readBody(req);if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!Array.isArray(b.items)||b.items.length>5000)return fail('Lista inválida');const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO saved_lists(id,user_id,name,list_type,items_json) VALUES(?,?,?,?,?)').bind(id,user.id,b.name.trim(),String(b.list_type||'names').slice(0,30),JSON.stringify(b.items)).run();return json({id},201);
 }
 return fail('Rota não encontrada',404);
}
export default {async fetch(req,env){const url=new URL(req.url);if(url.pathname.startsWith('/api/')){try{return await api(req,env,url)}catch(e){
   if(e instanceof BillingError)return fail(e.message,e.status);
   // Nunca registrar corpo da requisição, cookies, senhas ou credenciais.
   console.error('[SU_API] Exceção', {
     route:url.pathname,
     type:e?.name||'Error',
     message:String(e?.message||'Sem detalhes').slice(0,300)
   });
   return fail('Erro interno ao processar solicitação',500);
  }}return env.ASSETS.fetch(req)}};
