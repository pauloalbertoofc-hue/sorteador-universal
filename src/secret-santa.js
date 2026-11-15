import { drawSecretSanta, normalizeParticipants } from '../public/amigo-secreto/engine.mjs';

const encoder = new TextEncoder();
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const reply = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
const error = (message,status=400) => reply({error:message},status);

export async function secretSantaApi(req,env,path,rateLimit,requester,authenticatedUser=null){
  // Account endpoints are opt-in: legacy private links continue to work unchanged.
  // Do not enable these routes in production until migration 0008 is applied.
  if(path==='/api/secret-santa/account/events' && req.method==='GET'){
    if(!authenticatedUser)return error('Entre na sua conta para consultar seus eventos.',401);
    const events=(await env.DB.prepare(`SELECT id,title,status,distribution_mode,created_at,expires_at
      FROM secret_santa_events WHERE owner_user_id=? ORDER BY created_at DESC LIMIT 100`)
      .bind(authenticatedUser.id).all()).results;
    return reply({events:events.map(e=>({id:e.id,title:e.title,status:e.status,mode:e.distribution_mode,createdAt:e.created_at,expiresAt:e.expires_at}))});
  }
  if(req.method!=='POST')return error('Método não permitido',405);
  if(!await rateLimit('secret-santa',requester,10,3600000))return error('Muitas solicitações. Tente mais tarde.',429);
  const raw=await req.text();
  if(raw.length>12000)return error('Dados muito extensos',413);
  let body;
  try{body=JSON.parse(raw)}catch{return error('JSON inválido')}
  const accountCreation=path==='/api/secret-santa/account/events';
  if(accountCreation&&!authenticatedUser)return error('Entre na sua conta para organizar o sorteio.',401);
  if(path==='/api/secret-santa/events'||accountCreation){
    // Protected guest entry requires a separate credential-issuance flow.
    // Until that flow is implemented, only the established links mode is accepted.
    if(accountCreation && body.mode!==undefined && body.mode!=='links')return error('Modo protegido ainda não disponível.',422);
    const title=typeof body.title==='string'?body.title.trim():'';
    if(title.length<3||title.length>80||/[<>\x00-\x1f]/.test(title))return error('Título inválido');
    let names;
    try{names=normalizeParticipants(body.participants)}catch(e){return error(e.message)}
    if(names.some(name=>/[<>\x00-\x1f]/.test(name)))return error('Nome inválido');
    const assignments=drawSecretSanta(names);
    const id=crypto.randomUUID(),admin=token(),now=Date.now(),expires=now+30*86400000;
    const members=names.map(name=>({id:crypto.randomUUID(),name,accessToken:token()}));
    const byName=new Map(members.map(member=>[member.name,member]));
    const statements=[accountCreation
      ?env.DB.prepare('INSERT INTO secret_santa_events(id,title,admin_token_hash,status,created_at,expires_at,owner_user_id,distribution_mode) VALUES(?,?,?,?,?,?,?,?)').bind(id,title,await digest(admin),'drawn',now,expires,authenticatedUser.id,'links')
      :env.DB.prepare('INSERT INTO secret_santa_events(id,title,admin_token_hash,status,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(id,title,await digest(admin),'drawn',now,expires)];
    for(const assignment of assignments){
      const member=byName.get(assignment.giver),recipient=byName.get(assignment.recipient);
      statements.push(env.DB.prepare('INSERT INTO secret_santa_participants(id,event_id,display_name,name_key,access_token_hash) VALUES(?,?,?,?,?)').bind(member.id,id,member.name,member.name.normalize('NFKC').toLocaleLowerCase('pt-BR'),await digest(member.accessToken)));
    }
    for(const assignment of assignments){
      statements.push(env.DB.prepare('UPDATE secret_santa_participants SET recipient_id=? WHERE id=? AND event_id=?').bind(byName.get(assignment.recipient).id,byName.get(assignment.giver).id,id));
    }
    // Insert participants before assigning references, avoiding immediate FK violations.
    await env.DB.batch(statements);
    return reply({id,title,expiresAt:expires,participants:members.map(({name,accessToken})=>({name,accessToken}))},201);
  }
  const match=path.match(/^\/api\/secret-santa\/events\/([0-9a-f-]{36})\/reveal$/);
  if(match){
    const accessToken=body?.accessToken;
    if(typeof accessToken!=='string'||!(/^[0-9a-f]{64}$/.test(accessToken)))return error('Acesso negado',403);
    const row=await env.DB.prepare(`SELECT e.title,e.expires_at,p.display_name AS giver,r.display_name AS recipient
      FROM secret_santa_participants p
      JOIN secret_santa_events e ON e.id=p.event_id
      JOIN secret_santa_participants r ON r.id=p.recipient_id AND r.event_id=p.event_id
      WHERE e.id=? AND p.access_token_hash=? AND e.status='drawn' AND e.expires_at>?`).bind(match[1],await digest(accessToken),Date.now()).first();
    if(!row)return error('Link inválido ou expirado',404);
    return reply({title:row.title,giver:row.giver,recipient:row.recipient,expiresAt:row.expires_at});
  }
  return error('Rota não encontrada',404);
}
