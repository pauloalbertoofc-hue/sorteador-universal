const $ = id => document.getElementById(id);
const status = (id,message) => { $(id).textContent = message; };
const endpoint = '/api/secret-santa/events';
const params = new URLSearchParams(location.hash.slice(1));
const eventId = params.get('event');
const accessToken = params.get('token');
const validEvent = /^[0-9a-f-]{36}$/.test(eventId || '');
const validToken = /^[0-9a-f]{64}$/.test(accessToken || '');
function linkFor(id,token) {
  const url = new URL(location.pathname, location.origin);
  url.hash = new URLSearchParams({ event:id, token }).toString();
  return url.toString();
}
async function post(url,body) {
  const response = await fetch(url, {
    method:'POST', credentials:'omit', cache:'no-store',
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
if (eventId || accessToken) {
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
      const data = await post(endpoint,{title,participants});
      const items = data.participants.map(person => ({
        name:person.name, url:linkFor(data.id,person.accessToken)
      }));
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
      status('createStatus','Sorteio criado! Distribua os links individuais.');
      $('linksSection').scrollIntoView({behavior:'smooth'});
    } catch(error) { status('createStatus',error.message); }
    finally { button.disabled = false; }
  });
}
