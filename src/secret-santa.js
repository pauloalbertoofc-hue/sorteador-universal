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
  // New lifecycle is opt-in and separate from legacy immediate-draw events.
  if(path==='/api/secret-santa/account/drafts'){
    if(!authenticatedUser)return error('Entre na sua conta para organizar o sorteio.',401);
    const title=typeof body?.title==='string'?body.title.trim():'';
    const privacy=body?.privacy;
    if(title.length<3||title.length>80||/[<>\x00-\x1f]/.test(title))return error('Título inválido.',422);
    if(privacy!=='private'&&privacy!=='supervised')return error('Escolha a privacidade do sorteio.',422);
    const id=crypto.randomUUID(),invite=token(),admin=token(),now=Date.now(),expires=now+30*86400000;
    await env.DB.prepare(`INSERT INTO secret_santa_events
      (id,title,admin_token_hash,status,created_at,expires_at,owner_user_id,distribution_mode,privacy_mode,invite_token_hash)
      VALUES(?,?,?,'draft',?,?,?,'links',?,?)`)
      .bind(id,title,await digest(admin),now,expires,authenticatedUser.id,privacy,await digest(invite)).run();
    return reply({id,title,privacy,status:'draft',expiresAt:expires,inviteToken:invite},201);
  }
  const inviteInfo=path.match(/^\/api\/secret-santa\/events\/([0-9a-f-]{36})\/invite-info$/);
  if(inviteInfo){
    const invite=body?.inviteToken;
    if(typeof invite!=='string'||!/^[0-9a-f]{64}$/.test(invite))return error('Convite inválido.',403);
    const event=await env.DB.prepare(`SELECT id,title,status,privacy_mode,expires_at
      FROM secret_santa_events WHERE id=? AND invite_token_hash=? AND privacy_mode IS NOT NULL AND expires_at>?`)
      .bind(inviteInfo[1],await digest(invite),Date.now()).first();
    if(!event)return error('Convite inválido ou expirado.',404);
    return reply({id:event.id,title:event.title,status:event.status,privacy:event.privacy_mode,expiresAt:event.expires_at,
      organizerCanViewResults:event.privacy_mode==='supervised'});
  }
  // Shared invitation: the participant chooses a persistent account or a temporary identity.
  // A guest claim is a bearer secret. Never treat the display name as authentication.
  const enroll=path.match(/^\/api\/secret-santa\/events\/([0-9a-f-]{36})\/enroll$/);
  if(enroll){
    if(!await rateLimit('secret-santa-enroll',requester,8,3600000))return error('Muitas tentativas de inscrição.',429);
    const invite=body?.inviteToken,name=typeof body?.name==='string'?body.name.trim():'';
    const kind=body?.entry==='account'?'account':body?.entry==='guest'?'guest':null;
    if(typeof invite!=='string'||!/^[0-9a-f]{64}$/.test(invite))return error('Convite inválido.',403);
    if(!kind)return error('Escolha entrar com conta ou como convidado.',422);
    if(kind==='account'&&!authenticatedUser)return error('Entre na sua conta para continuar.',401);
    if(name.length<1||name.length>80||/[<>\x00-\x1f]/.test(name))return error('Nome inválido.',422);
    const event=await env.DB.prepare(`SELECT id,status,expires_at FROM secret_santa_events
      WHERE id=? AND invite_token_hash=? AND privacy_mode IS NOT NULL AND expires_at>?`)
      .bind(enroll[1],await digest(invite),Date.now()).first();
    if(!event)return error('Convite inválido ou expirado.',404);
    if(event.status!=='draft')return error('As inscrições deste evento estão encerradas.',409);
    // A permanent account may enroll only once per event, regardless of display name.
    if(kind==='account'){
      const existing=await env.DB.prepare('SELECT id FROM secret_santa_enrollments WHERE event_id=? AND user_id=? LIMIT 1')
        .bind(enroll[1],authenticatedUser.id).first();
      if(existing)return error('Esta conta já está inscrita no evento.',409);
    }
    const claim=token(),id=crypto.randomUUID(),nameKey=name.normalize('NFKC').toLocaleLowerCase('pt-BR');
    try{
      const inserted=await env.DB.prepare(`INSERT INTO secret_santa_enrollments
        (id,event_id,display_name,name_key,auth_kind,user_id,claim_token_hash,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE
          (SELECT status FROM secret_santa_events WHERE id=?)='draft'`)
        .bind(id,enroll[1],name,nameKey,kind,kind==='account'?authenticatedUser.id:null,await digest(claim),Date.now(),enroll[1]).run();
      if(inserted.meta?.changes!==1)return error('As inscrições deste evento estão encerradas.',409);
    }catch(e){
      if(/UNIQUE constraint failed/i.test(String(e)))return error('Este nome já está inscrito neste evento.',409);
      throw e;
    }
    return reply({id,name,entry:kind,claimToken:claim,status:'enrolled'},201);
  }
  // Only the authenticated event owner may freeze enrollment. No drawing or
  // participant secrets are exposed at this stage.
  const close=path.match(/^\/api\/secret-santa\/account\/events\/([0-9a-f-]{36})\/close-enrollment$/);
  if(close){
    if(!authenticatedUser)return error('Entre na sua conta para encerrar as inscrições.',401);
    const event=await env.DB.prepare(`SELECT id,status,privacy_mode,expires_at FROM secret_santa_events
      WHERE id=? AND owner_user_id=? AND privacy_mode IS NOT NULL AND expires_at>?`)
      .bind(close[1],authenticatedUser.id,Date.now()).first();
    if(!event)return error('Evento não encontrado ou sem permissão.',404);
    if(event.status!=='draft')return error('Inscrições já encerradas.',409);
    const row=await env.DB.prepare('SELECT COUNT(*) AS total FROM secret_santa_enrollments WHERE event_id=?')
      .bind(close[1]).first();
    if(Number(row?.total)<2)return error('São necessários pelo menos dois participantes.',422);
    const now=Date.now();
    const updated=await env.DB.prepare(`UPDATE secret_santa_events
      SET status='enrollment_closed',enrollment_closed_at=?
      WHERE id=? AND owner_user_id=? AND status='draft' AND privacy_mode IS NOT NULL
        AND expires_at>? AND (SELECT COUNT(*) FROM secret_santa_enrollments WHERE event_id=?)>=2`)
      .bind(now,close[1],authenticatedUser.id,now,close[1]).run();
    if(updated.meta?.changes!==1)return error('As inscrições já foram encerradas ou o evento expirou.',409);
    return reply({id:close[1],status:'enrollment_closed',participants:Number(row.total),privacy:event.privacy_mode});
  }
  const accountCreation=path==='/api/secret-santa/account/events';
  if(accountCreation&&!authenticatedUser)return error('Entre na sua conta para organizar o sorteio.',401);
  if(path==='/api/secret-santa/events'||accountCreation){
    // Protected guest entry requires a separate credential-issuance flow.
    // Until that flow is implemented, only the established links mode is accepted.
    const mode=accountCreation?(body.mode||'links'):'links';
    if(mode!=='links')return error('Modo de ingresso antigo desativado; aguarde o novo fluxo de privacidade.',422);
    const title=typeof body.title==='string'?body.title.trim():'';
    if(title.length<3||title.length>80||/[<>\x00-\x1f]/.test(title))return error('Título inválido');
    let names;
    try{names=normalizeParticipants(body.participants)}catch(e){return error(e.message)}
    if(names.some(name=>/[<>\x00-\x1f]/.test(name)))return error('Nome inválido');
    const assignments=drawSecretSanta(names);
    const id=crypto.randomUUID(),admin=token(),now=Date.now(),expires=now+30*86400000;
    const members=names.map(name=>({id:crypto.randomUUID(),name,accessToken:token(),entryCode:mode==='protected'?token():null}));
    const byName=new Map(members.map(member=>[member.name,member]));
    const statements=[accountCreation
      ?env.DB.prepare('INSERT INTO secret_santa_events(id,title,admin_token_hash,status,created_at,expires_at,owner_user_id,distribution_mode) VALUES(?,?,?,?,?,?,?,?)').bind(id,title,await digest(admin),'drawn',now,expires,authenticatedUser.id,mode)
      :env.DB.prepare('INSERT INTO secret_santa_events(id,title,admin_token_hash,status,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(id,title,await digest(admin),'drawn',now,expires)];
    for(const assignment of assignments){
      const member=byName.get(assignment.giver),recipient=byName.get(assignment.recipient);
      statements.push(env.DB.prepare('INSERT INTO secret_santa_participants(id,event_id,display_name,name_key,access_token_hash) VALUES(?,?,?,?,?)').bind(member.id,id,member.name,member.name.normalize('NFKC').toLocaleLowerCase('pt-BR'),await digest(member.accessToken)));
    }
    if(mode==='protected'){
      for(const member of members)statements.push(env.DB.prepare(
        'INSERT INTO secret_santa_guest_credentials(id,event_id,participant_id,credential_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)'
      ).bind(crypto.randomUUID(),id,member.id,await digest(member.entryCode),expires,now));
    }
    for(const assignment of assignments){
      statements.push(env.DB.prepare('UPDATE secret_santa_participants SET recipient_id=? WHERE id=? AND event_id=?').bind(byName.get(assignment.recipient).id,byName.get(assignment.giver).id,id));
    }
    // Insert participants before assigning references, avoiding immediate FK violations.
    await env.DB.batch(statements);
    return reply({id,title,expiresAt:expires,mode,participants:members.map(({name,accessToken,entryCode})=>
      mode==='protected'?{name,entryCode}:{name,accessToken})},201);
  }
  // Guest admission requires an individual high-entropy entry code.
  // Names are display hints, never authenticators. The organizer who distributes
  // codes can still impersonate guests: this is not organizer-blind delivery.
  const join=path.match(/^\/api\/secret-santa\/events\/([0-9a-f-]{36})\/join$/);
  if(join){
    if(!await rateLimit('secret-santa-join',requester,12,3600000))return error('Muitas tentativas.',429);
    const entryCode=body?.entryCode;
    if(typeof entryCode!=='string'||!/^[0-9a-f]{64}$/.test(entryCode))return error('Credencial inválida.',403);
    const row=await env.DB.prepare(`SELECT c.id,c.participant_id,e.title,e.expires_at
      FROM secret_santa_guest_credentials c JOIN secret_santa_events e ON e.id=c.event_id
      WHERE c.event_id=? AND c.credential_hash=? AND c.redeemed_at IS NULL
        AND c.revoked_at IS NULL AND c.expires_at>? AND e.expires_at>?
        AND e.status='drawn' AND e.distribution_mode='protected'`)
      .bind(join[1],await digest(entryCode),Date.now(),Date.now()).first();
    if(!row)return error('Credencial inválida, utilizada ou expirada.',403);
    const session=token(),now=Date.now(),expiry=Math.min(row.expires_at,now+24*3600000);
    // Atomic compare-and-set: only one concurrent redemption can succeed.
    const claimed=await env.DB.prepare(
      'UPDATE secret_santa_guest_credentials SET redeemed_at=? WHERE id=? AND redeemed_at IS NULL AND revoked_at IS NULL RETURNING id'
    ).bind(now,row.id).first();
    if(!claimed)return error('Credencial já utilizada.',403);
    await env.DB.prepare('INSERT INTO secret_santa_guest_sessions(token_hash,event_id,participant_id,expires_at,created_at) VALUES(?,?,?,?,?)')
      .bind(await digest(session),join[1],row.participant_id,expiry,now).run();
    return reply({sessionToken:session,expiresAt:expiry,title:row.title});
  }
  const guestReveal=path.match(/^\/api\/secret-santa\/events\/([0-9a-f-]{36})\/guest-reveal$/);
  if(guestReveal){
    const sessionToken=body?.sessionToken;
    if(typeof sessionToken!=='string'||!/^[0-9a-f]{64}$/.test(sessionToken))return error('Acesso negado.',403);
    const row=await env.DB.prepare(`SELECT e.title,e.expires_at,p.display_name AS giver,r.display_name AS recipient
      FROM secret_santa_guest_sessions s
      JOIN secret_santa_events e ON e.id=s.event_id
      JOIN secret_santa_participants p ON p.id=s.participant_id AND p.event_id=s.event_id
      JOIN secret_santa_participants r ON r.id=p.recipient_id AND r.event_id=p.event_id
      WHERE s.event_id=? AND s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
        AND e.status='drawn' AND e.distribution_mode='protected' AND e.expires_at>?`)
      .bind(guestReveal[1],await digest(sessionToken),Date.now(),Date.now()).first();
    if(!row)return error('Sessão inválida ou expirada.',403);
    return reply({title:row.title,giver:row.giver,recipient:row.recipient,expiresAt:row.expires_at});
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
