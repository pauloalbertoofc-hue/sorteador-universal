const $ = id => document.getElementById(id);
const status = (id,message) => { $(id).textContent = message; };
const endpoint = '/api/secret-santa/events';
const params = new URLSearchParams(location.hash.slice(1));
const eventId = params.get('event');
const accessToken = params.get('token');
const guestCode = params.get('guest');
const guestInvite = params.get('invite') === '1';
const protectedInvite = !!eventId && (guestInvite || !!guestCode);
const validEvent = /^[0-9a-f-]{36}$/.test(eventId || '');
const validToken = /^[0-9a-f]{64}$/.test(accessToken || '');
const validGuestCode = /^[0-9a-f]{64}$/.test(guestCode || '');
function linkFor(id,token) {
  const url = new URL(location.pathname, location.origin);
  url.hash = new URLSearchParams({ event:id, token }).toString();
  return url.toString();
}
function guestLinkFor(id,code) {
  const url = new URL(location.pathname,location.origin);
  url.hash = new URLSearchParams({event:id,guest:code}).toString();
  return url.toString();
}
async function post(url,body,authenticated=false) {
  const response = await fetch(url, {
    method:'POST', credentials:authenticated?'same-origin':'omit', cache:'no-store',
    headers:{'content-type':'application/json'}, body:JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a solicitação.');
  return data;
}
async function copy(value) {
  if (!navigator.clipboard?.writeText) throw new Error('Cópia indisponível neste navegador.');
  await navigator.clipboard.writeText(value);
}
if (protectedInvite) {
  $('createSection').classList.add('hidden');
  $('guestJoinSection').classList.remove('hidden');
  if(!validEvent) status('guestJoinStatus','Convite inválido.');
  if(validGuestCode) $('guestCode').value=guestCode;
  $('guestJoinForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!validEvent)return;
    const code=$('guestCode').value.trim().toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(code)){status('guestJoinStatus','Código inválido.');return;}
    const button=$('guestJoinButton');button.disabled=true;
    status('guestJoinStatus','Verificando seu acesso…');
    try{
      const admission=await post(endpoint+'/'+eventId+'/join',{entryCode:code});
      // Remove the one-time entry code from the address bar immediately after redemption.
      history.replaceState(null,'',location.pathname+'#'+new URLSearchParams({event:eventId,invite:'1'}));
      $('guestCode').value='';
      const result=await post(endpoint+'/'+eventId+'/guest-reveal',{sessionToken:admission.sessionToken});
      $('guestJoinSection').classList.add('hidden');
      $('revealSection').classList.remove('hidden');
      $('revealStatus').textContent='Resultado encontrado.';
      $('giver').textContent='Olá, '+result.giver+'!';
      $('recipient').textContent=result.recipient;
      $('expiry').textContent='Válido até '+new Date(result.expiresAt).toLocaleDateString('pt-BR')+'.';
      $('revealResult').classList.remove('hidden');
    }catch(error){status('guestJoinStatus',error.message)}
    finally{button.disabled=false}
  });
} else if (eventId || accessToken) {
  $('createSection').classList.add('hidden');
  $('revealSection').classList.remove('hidden');
  if (!validEvent || !validToken) status('revealStatus','Link inválido. Peça ao organizador seu link individual.');
  else {
    // The token remains in the URL fragment, never in the request path or query.
    post(endpoint + '/' + eventId + '/reveal',{accessToken})
      .then(data => {
        $('revealStatus').textContent = 'Resultado encontrado.';
        $('giver').textContent = 'Olá, ' + data.giver + '!';
        $('recipient').textContent = data.recipient;
        $('expiry').textContent = 'Link válido até ' + new Date(data.expiresAt).toLocaleDateString('pt-BR') + '.';
        $('revealResult').classList.remove('hidden');
      })
      .catch(error => status('revealStatus',error.message));
  }
} else {
  const modeInputs=[...document.querySelectorAll('input[name="distributionMode"]')];
  const refreshMode=()=>{
    const protectedMode=modeInputs.find(input=>input.checked)?.value==='protected';
    $('accountNotice').classList.toggle('hidden',!protectedMode);
    $('createButton').textContent=protectedMode?'Sortear e gerar códigos':'Sortear e gerar links';
  };
  modeInputs.forEach(input=>input.addEventListener('change',refreshMode));
  refreshMode();
  $('createForm').addEventListener('submit',async event => {
    event.preventDefault();
    const button = $('createButton');
    const title = $('title').value.trim();
    const participants = $('names').value.split(/\r?\n/).map(name=>name.trim()).filter(Boolean);
    if (participants.length < 2 || participants.length > 100) {
      status('createStatus','Informe entre 2 e 100 participantes.'); return;
    }
    button.disabled = true;
    status('createStatus','Criando o evento…');
    try {
      const mode=modeInputs.find(input=>input.checked)?.value||'links';
      const data=await post(mode==='protected'?'/api/secret-santa/account/events':endpoint,{title,participants,mode},mode==='protected');
      const protectedMode=data.mode==='protected';
      const items=data.participants.map(person=>({
        name:person.name,url:protectedMode?guestLinkFor(data.id,person.entryCode):linkFor(data.id,person.accessToken)
      }));
      $('linksHeading').textContent=protectedMode?'Convites com códigos individuais':'Links individuais';
      if(protectedMode){
        $('linksHelp').textContent='Envie cada convite somente ao participante indicado. O código individual dá acesso uma única vez; quem recebê-lo primeiro poderá utilizá-lo. Não publique a lista.';
        $('linksFootnote').textContent='O organizador distribui os códigos e pode utilizá-los antes dos convidados. O acesso temporário não garante sigilo contra quem distribui os códigos.';
      }
      const container = $('links');
      container.replaceChildren();
      for (const item of items) {
        const div = document.createElement('div'); div.className = 'person';
        const name = document.createElement('strong'); name.textContent = item.name;
        const actions = document.createElement('div'); actions.className = 'actions';
        const share = document.createElement('button'); share.type = 'button';
        share.textContent = 'Compartilhar';
        share.addEventListener('click',async () => {
          const text = 'Olá, ' + item.name + '! Veja quem você tirou no amigo secreto: ' + item.url;
          try {
            if (navigator.share) await navigator.share({text});
            else { await copy(text); status('createStatus','Mensagem copiada para compartilhar.'); }
          } catch (error) { if (error.name !== 'AbortError') status('createStatus',error.message); }
        });
        const cp = document.createElement('button'); cp.type='button'; cp.className='secondary'; cp.textContent='Copiar link';
        cp.addEventListener('click',()=>copy(item.url).then(()=>status('createStatus','Link de ' + item.name + ' copiado.')).catch(e=>status('createStatus',e.message)));
        actions.append(share,cp); div.append(name,actions); container.append(div);
      }
      $('copyAll').onclick = () => copy(items.map(item=>item.name + ': ' + item.url).join('\n')).then(()=>status('createStatus','Lista copiada. Guarde-a em local privado.')).catch(e=>status('createStatus',e.message));
      $('linksSection').classList.remove('hidden');
      $('createForm').classList.add('hidden');
      status('createStatus',protectedMode?'Sorteio criado! Distribua os códigos privados individualmente.':'Sorteio criado! Distribua os links individuais.');
      $('linksSection').scrollIntoView({behavior:'smooth'});
    } catch(error) { status('createStatus',error.message); }
    finally { button.disabled = false; }
  });
}
