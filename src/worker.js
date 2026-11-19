import { secretSantaApi } from './secret-santa.js';
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
async function api(req,env,url,ctx){const path=url.pathname,method=req.method;
 if(!env.DB)return fail('Banco D1 não conectado.',503);
 if(!['GET','POST','DELETE'].includes(method))return fail('Método não permitido',405);
 if(method!=='GET'&&!originOk(req)&&path!=='/api/webhooks/mercadopago')return fail('Origem inválida',403);
 // Public rooms: anonymous registration, short lifetime, bounded capacity and no account data.
 const roomMatch=path.match(/^\/api\/rooms\/([0-9a-f]{32})(?:\/(join|close|draw))?$/);
 async function roomRateLimit(scope,identity,limit,windowMs){
  const bucket=Math.floor(Date.now()/windowMs),key=await sha(scope+':'+identity+':'+bucket);
  await env.DB.prepare('INSERT INTO draw_room_rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1').bind(key,(bucket+1)*windowMs).run();
  const record=await env.DB.prepare('SELECT hits FROM draw_room_rate_limits WHERE key=?').bind(key).first();
  return record.hits<=limit;
 }
 const requester=req.headers.get('cf-connecting-ip')||'unknown';
 if(path.startsWith('/api/secret-santa/'))return secretSantaApi(req,env,path,roomRateLimit,requester);
 if(path==='/api/rooms'&&method==='POST'){
  if(!await roomRateLimit('create',requester,5,3600000))return fail('Muitas salas criadas. Tente mais tarde.',429);
  const body=await readBody(req);const title=typeof body.title==='string'?body.title.trim():'';
  if(title.length<3||title.length>80||/[<>\x00-\x1f]/.test(title))return fail('Título inválido (3 a 80 caracteres).');
  const max=Number(body.maxEntries);
  if(!Number.isInteger(max)||max<2||max>100)return fail('Limite inválido (2 a 100).');
  const drawMode=body.drawMode===undefined?'classic':body.drawMode;
  if(!['classic','live'].includes(drawMode))return fail('Modo de sorteio inválido.');
  const id=random(16),adminToken=random(32),now=Date.now(),expiresAt=now+24*3600000;
  await env.DB.prepare('INSERT INTO draw_rooms(id,admin_hash,title,status,created_at,expires_at,max_entries,draw_mode) VALUES(?,?,?,?,?,?,?,?)').bind(id,await sha(adminToken),title,'open',now,expiresAt,max,drawMode).run();
  return json({id,title,maxEntries:max,expiresAt,adminToken,drawMode},201);
 }
 if(roomMatch&&method==='GET'&&!roomMatch[2]){
  const room=await env.DB.prepare('SELECT id,title,status,expires_at,max_entries,draw_mode FROM draw_rooms WHERE id=?').bind(roomMatch[1]).first();
  if(!room)return fail('Sala não encontrada',404);
  // Expired rooms stop exposing participant names immediately, before cron cleanup.
  const expired=room.expires_at<=Date.now();
  const entries=expired?[]:(await env.DB.prepare('SELECT display_name FROM draw_room_entries WHERE room_id=? ORDER BY created_at,id LIMIT 100').bind(room.id).all()).results.map(e=>e.display_name);
  const draws=expired||room.draw_mode!=='live'?[]:(await env.DB.prepare('SELECT round_number,winner_name,drawn_at FROM draw_room_events WHERE room_id=? ORDER BY round_number LIMIT 100').bind(room.id).all()).results.map(x=>({round:x.round_number,winner:x.winner_name,at:x.drawn_at}));
  return json({id:room.id,title:room.title,status:room.status==='open'&&!expired?'open':'closed',expiresAt:room.expires_at,maxEntries:room.max_entries,drawMode:room.draw_mode,entries,draws,serverTime:Date.now()});
 }
 if(roomMatch&&method==='POST'&&roomMatch[2]==='join'){
  if(!await roomRateLimit('join',requester,30,3600000))return fail('Muitas inscrições. Tente mais tarde.',429);
  const body=await readBody(req),name=typeof body.name==='string'?body.name.trim().replace(/\s+/g,' '):'';
  if(name.length<2||name.length>60||/[<>\x00-\x1f]/.test(name))return fail('Nome inválido (2 a 60 caracteres).');
  const key=name.normalize('NFKC').toLocaleLowerCase('pt-BR');
  const room=await env.DB.prepare('SELECT status,expires_at,max_entries FROM draw_rooms WHERE id=?').bind(roomMatch[1]).first();
  if(!room)return fail('Sala não encontrada',404);
  if(room.status!=='open'||room.expires_at<=Date.now())return fail('Inscrições encerradas',409);
  // Single atomic statement prevents exceeding capacity under concurrent joins.
  const insert=await env.DB.prepare(`INSERT OR IGNORE INTO draw_room_entries(id,room_id,display_name,name_key,created_at)
   SELECT ?,id,?,?,? FROM draw_rooms WHERE id=? AND status='open' AND expires_at>? AND
   (SELECT COUNT(*) FROM draw_room_entries WHERE room_id=?)<max_entries`).bind(random(16),name,key,Date.now(),roomMatch[1],Date.now(),roomMatch[1]).run();
  if(!insert.meta?.changes)return fail('Nome já inscrito ou sala lotada',409);
  return json({ok:true},201);
 }
 if(roomMatch&&method==='POST'&&roomMatch[2]==='close'){
  if(!await roomRateLimit('close',requester,20,3600000))return fail('Muitas tentativas. Tente mais tarde.',429);
  const token=req.headers.get('x-room-admin-token')||'';
  if(!/^[0-9a-f]{64}$/.test(token))return fail('Acesso negado',403);
  const room=await env.DB.prepare('SELECT admin_hash FROM draw_rooms WHERE id=?').bind(roomMatch[1]).first();
  if(!room||!equal(room.admin_hash,await sha(token)))return fail('Acesso negado',403);
  await env.DB.prepare("UPDATE draw_rooms SET status='closed' WHERE id=?").bind(roomMatch[1]).run();
  return json({ok:true});
 }
 if(roomMatch&&method==='POST'&&roomMatch[2]==='draw'){
  if(!await roomRateLimit('draw',requester,30,3600000))return fail('Muitos sorteios. Tente mais tarde.',429);
  const token=req.headers.get('x-room-admin-token')||'';
  if(!/^[0-9a-f]{64}$/.test(token))return fail('Acesso negado',403);
  const room=await env.DB.prepare('SELECT admin_hash,status,expires_at,draw_mode FROM draw_rooms WHERE id=?').bind(roomMatch[1]).first();
  if(!room||!equal(room.admin_hash,await sha(token)))return fail('Acesso negado',403);
  if(room.expires_at<=Date.now())return fail('Sala expirada',409);
  if(room.draw_mode!=='live')return fail('Esta sala utiliza o sorteio tradicional do organizador.',409);
  if(room.status!=='closed')return fail('Encerre as inscrições antes de sortear.',409);
  // One atomic SQL statement picks an eligible participant and records the next round.
  // UNIQUE(room_id,round_number) prevents duplicate rounds in concurrent requests.
  const now=Date.now();
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO draw_room_events(id,room_id,round_number,winner_name,drawn_at)
   SELECT ?,r.id,COALESCE((SELECT MAX(round_number)+1 FROM draw_room_events WHERE room_id=r.id),1),
     e.display_name,?
   FROM draw_rooms r JOIN draw_room_entries e ON e.room_id=r.id
   WHERE r.id=? AND r.status='closed' AND r.draw_mode='live' AND r.expires_at>?
     AND (SELECT COUNT(*) FROM draw_room_events WHERE room_id=r.id)<100
     AND NOT EXISTS (SELECT 1 FROM draw_room_events d WHERE d.room_id=r.id AND d.winner_name=e.display_name)
   ORDER BY random() LIMIT 1`).bind(random(16),now,roomMatch[1],now).run();
  if(!result.meta?.changes)return fail('Todos os participantes já foram sorteados ou houve uma tentativa simultânea. Atualize a sala.',409);
  const event=await env.DB.prepare('SELECT round_number,winner_name,drawn_at FROM draw_room_events WHERE room_id=? ORDER BY round_number DESC LIMIT 1').bind(roomMatch[1]).first();
  return json({round:event.round_number,winner:event.winner_name,at:event.drawn_at},201);
 }
 if(path==='/api/health'&&method==='GET')return json({ok:true,version:'2.0.4'});
 if(path==='/api/password/request'&&method==='POST'){
  const resetUnavailable=reason=>{console.warn('password-reset-config',reason);return fail('Recuperação temporariamente indisponível.',503);};
  if(!env.RESET_EMAIL_API_KEY)return resetUnavailable('missing-api-key');
  if(!env.RESET_EMAIL_FROM)return resetUnavailable('missing-sender');
  if(!env.RESET_SITE_URL)return resetUnavailable('missing-site-url');
  let link;try{link=new URL(env.RESET_SITE_URL);}catch{return resetUnavailable('invalid-site-url');}
  if(link.protocol!=='https:'||link.username||link.password||link.pathname!=='/'||link.search||link.hash)return resetUnavailable('invalid-site-url-policy');
  if(link.origin!==url.origin)return resetUnavailable('origin-mismatch');
  const {email}=await readBody(req);const e=String(email||'').trim().toLowerCase();
  const generic=()=>json({ok:true,message:'Se houver uma conta elegível, enviaremos instruções por e-mail.'});
  if(e.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))return generic();
  if(!await roomRateLimit('reset-ip',requester,10,3600000)||!await roomRateLimit('reset-email',e,3,3600000))return generic();
  const deliver=async()=>{
  const user=await env.DB.prepare('SELECT id,email FROM users WHERE email=?').bind(e).first();
  if(!user)return;
  const token=random(32),digest=await sha(token),now=Date.now();

  link.hash='su-reset='+token;
  await env.DB.prepare('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at').bind(user.id,digest,now+900000).run();
  try{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+env.RESET_EMAIL_API_KEY,'content-type':'application/json'},body:JSON.stringify({from:env.RESET_EMAIL_FROM,to:[user.email],subject:'Redefinição de senha — Sorteador Universal',text:'Use este link em até 15 minutos: '+link.href+'\nSe não solicitou, ignore este e-mail.'})});
   if(!response.ok)throw Error('delivery');
  }catch{await env.DB.prepare('DELETE FROM password_resets WHERE token_hash=?').bind(digest).run();}
  };
  if(ctx?.waitUntil)ctx.waitUntil(deliver().catch(()=>{}));else await deliver();
  return generic();
 }
 if(path==='/api/password/reset'&&method==='POST'){
  if(!await roomRateLimit('reset-submit',requester,15,3600000))return fail('Tente mais tarde.',429);
  const {token,password}=await readBody(req);
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||typeof password!=='string'||password.length<10||password.length>128)return fail('Link ou senha inválidos.');
  const digest=await sha(token),salt=random(16),hash=await pbkdf(password,salt),now=Date.now();
  const results=await env.DB.batch([
   env.DB.prepare('DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?)').bind(digest,now),
   env.DB.prepare('UPDATE users SET password_hash=? WHERE id IN (SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?)').bind('pbkdf2$'+salt+'$'+hash,digest,now),
   env.DB.prepare('DELETE FROM password_resets WHERE token_hash=?').bind(digest)
  ]);
  if(!results[1].meta?.changes)return fail('Link inválido ou expirado.');
  return json({ok:true},200,{'set-cookie':sessionCookie('',0)});
 }
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
  const {email,password}=await readBody(req);if(typeof password!=='string'||password.length>128)return fail('Credenciais inválidas',401);const user=await env.DB.prepare('SELECT id,password_hash FROM users WHERE email=?').bind(String(email||'').trim().toLowerCase()).first();if(!user||!user.password_hash?.startsWith('pbkdf2$'))return fail('Credenciais inválidas',401);const [,salt,hash]=user.password_hash.split('$');if(!equal(await pbkdf(password,salt),hash))return fail('Credenciais inválidas',401);const token=random(32);const inserted=await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) SELECT ?,id,? FROM users WHERE id=? AND password_hash=?').bind(await sha(token),Date.now()+30*86400000,user.id,user.password_hash).run();if(!inserted.meta?.changes)return fail('Credenciais inválidas',401);return json({ok:true},200,{'set-cookie':sessionCookie(token,30*86400)});
 }
 if(path==='/api/logout'&&method==='POST'){const user=await auth(req,env);if(user)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();return json({ok:true},200,{'set-cookie':sessionCookie('',0)})}
 const user=await auth(req,env);
 if(path==='/api/me'&&method==='GET'){
  if(!user)return json({user:null,subscription:{active:false}});
  const subscription=await subscriptionState(env,user),billing=await billingInfo(env,user),now=Date.now();
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
export default {async scheduled(_event,env){
  if(!env.DB)return;
  const now=Date.now();
  // D1 does not necessarily enforce FK cascades: delete dependent entries first.
  await env.DB.prepare('DELETE FROM draw_room_events WHERE room_id IN (SELECT id FROM draw_rooms WHERE expires_at<=?)').bind(now).run();
  await env.DB.prepare('DELETE FROM draw_room_entries WHERE room_id IN (SELECT id FROM draw_rooms WHERE expires_at<=?)').bind(now).run();
  await env.DB.prepare('DELETE FROM draw_rooms WHERE expires_at<=?').bind(now).run();
  await env.DB.prepare('DELETE FROM draw_room_rate_limits WHERE expires_at<=?').bind(now).run();
  await env.DB.prepare('DELETE FROM password_resets WHERE expires_at<=?').bind(now).run();
},async fetch(req,env,ctx){const url=new URL(req.url);if(env.PREVIEW_ROOMS_ONLY==='true'&&url.pathname.startsWith('/api/')&&url.pathname!=='/api/rooms'&&!/^\/api\/rooms\/[a-f0-9]{32}(?:\/(?:join|close|draw))?$/.test(url.pathname))return fail('Rota indisponível no ambiente de prévia',404);if(url.pathname.startsWith('/api/')){try{return await api(req,env,url,ctx)}catch(e){
   if(e instanceof BillingError){
     if(url.pathname==='/api/webhooks/mercadopago' && e.message==='Webhook indisponível.'){
       // Diagnostics expose only validation outcomes, never secret values or request data.
       let validSite=false;
       try {const u=new URL(env.PUBLIC_SITE_URL);validSite=u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;} catch {}
       console.warn('[SU_BILLING] webhook_configuration_invalid',{
         access_token_present:typeof env.MP_ACCESS_TOKEN==='string'&&env.MP_ACCESS_TOKEN.length>0,
         webhook_secret_present:typeof env.MP_WEBHOOK_SECRET==='string'&&env.MP_WEBHOOK_SECRET.length>0,
         plan_id_valid:/^[a-f0-9]{32}$/i.test(env.MP_PLAN_ID||''),
         public_site_url_valid:validSite
       });
     }
     return fail(e.message,e.status);
   }
   // Nunca registrar corpo da requisição, cookies, senhas ou credenciais.
   console.error('[SU_API] Exceção', {
     route:url.pathname,
     type:e?.name||'Error',
     message:String(e?.message||'Sem detalhes').slice(0,300)
   });
   return fail('Erro interno ao processar solicitação',500);
  }}return env.ASSETS.fetch(req)}};
