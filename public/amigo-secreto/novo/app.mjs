const $=id=>document.getElementById(id);
const api='/api/secret-santa',hash=new URLSearchParams(location.hash.slice(1));
const eventId=hash.get('event'),inviteToken=hash.get('invite'),claimToken=hash.get('claim'),accountResult=hash.get('account')==='1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,secret=/^[0-9a-f]{64}$/;
let activeEvent=null,activeClaim=null;
const show=id=>$(id).classList.remove('hidden');
const hide=id=>$(id).classList.add('hidden');
const message=(id,value)=>$(id).textContent=value;
async function request(path,body,method='POST'){
 const response=await fetch(api+path,{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||'Não foi possível concluir.');
 return data;
}
function privateUrl(id,key,value){const url=new URL(location.pathname,location.origin);url.hash=new URLSearchParams({event:id,[key]:value}).toString();return url.toString();}
async function copy(value){if(!navigator.clipboard?.writeText)throw Error('Cópia indisponível neste navegador.');await navigator.clipboard.writeText(value);}
if(eventId||inviteToken||claimToken){
 hide('organizer');hide('myEvents');
 if(!uuid.test(eventId||'')||(!secret.test(inviteToken||'')&&!secret.test(claimToken||'')&&!accountResult)){show('join');message('joinStatus','Convite ou acesso inválido.');}
 else if(accountResult){
  activeClaim={id:eventId,entry:'account'};show('claim');hide('copyClaim');message('claimStatus','Resultado vinculado à sua conta. Entre na conta utilizada na inscrição para consultar.');
 }else if(secret.test(claimToken||'')){
  activeClaim={id:eventId,token:claimToken};show('claim');
 }else{
  show('join');
  $('enrollButton').disabled=true;
  request('/events/'+eventId+'/invite-info',{inviteToken}).then(data=>{
   $('enrollButton').disabled=false;
   message('eventInfo',data.title+' — '+(data.privacy==='private'?'sorteio privado':'sorteio supervisionado'));
   if(data.status!=='draft'){$('enrollButton').disabled=true;message('joinStatus','As inscrições deste evento não estão abertas.');}
  }).catch(error=>{$('enrollButton').disabled=true;message('joinStatus',error.message);});
 }
}
$('create').addEventListener('submit',async event=>{
 event.preventDefault();$('createButton').disabled=true;message('createStatus','Criando evento…');
 try{
  const data=await request('/account/drafts',{title:$('title').value.trim(),privacy:$('privacy').value});
  activeEvent=data;hide('organizer');hide('myEvents');show('manage');message('manageStatus','Evento criado. Convide os participantes.');
 }catch(error){message('createStatus',error.message+' Use o acesso à conta no cabeçalho do site para entrar.');}
 finally{$('createButton').disabled=false;}
});
$('copy').addEventListener('click',async()=>{try{if(!activeEvent.inviteToken)throw Error('Convite anterior indisponível. Gere um novo convite.');await copy(privateUrl(activeEvent.id,'invite',activeEvent.inviteToken));message('manageStatus','Convite copiado.');}catch(e){message('manageStatus',e.message);}});
$('share').addEventListener('click',async()=>{try{if(!activeEvent.inviteToken)throw Error('Convite anterior indisponível. Gere um novo convite.');const text='Entre no nosso amigo secreto: '+privateUrl(activeEvent.id,'invite',activeEvent.inviteToken);if(navigator.share)await navigator.share({text});else await copy(text);}catch(e){if(e.name!=='AbortError')message('manageStatus',e.message);}});
$('close').addEventListener('click',async()=>{
 if(!confirm('Encerrar inscrições? Não será possível adicionar mais participantes.'))return;
 $('close').disabled=true;
 try{const data=await request('/account/events/'+activeEvent.id+'/close-enrollment',{});message('manageStatus','Inscrições encerradas com '+data.participants+' participantes.');$('draw').disabled=false;}
 catch(e){$('close').disabled=false;message('manageStatus',e.message);}
});
$('draw').addEventListener('click',async()=>{
 if(!confirm('Realizar sorteio agora?'))return;
 $('draw').disabled=true;
 try{const data=await request('/account/events/'+activeEvent.id+'/draw',{});message('manageStatus','Sorteio realizado para '+data.participants+' participantes. Cada um pode consultar seu próprio acesso.');if(activeEvent.privacy==='supervised')show('audit');}
 catch(e){$('draw').disabled=false;message('manageStatus',e.message);}
});
$('enroll').addEventListener('submit',async event=>{
 event.preventDefault();$('enrollButton').disabled=true;
 try{
  const data=await request('/events/'+eventId+'/enroll',{inviteToken,name:$('name').value.trim(),entry:$('entry').value});
  if(!secret.test(data.claimToken||''))throw Error('Resposta de inscrição sem credencial válida.');
  const account=data.entry==='account';
  activeClaim={id:eventId,token:account?null:data.claimToken,entry:data.entry};
  history.replaceState(null,'',account?privateUrl(eventId,'account','1'):privateUrl(eventId,'claim',data.claimToken));
  hide('join');show('claim');
  if(account){hide('copyClaim');message('claimStatus','Inscrição confirmada e vinculada à sua conta. Guarde este endereço ou retorne com a mesma conta.');}
  else message('claimStatus','Inscrição confirmada. Guarde seu acesso antes de sair.');
 }catch(e){$('enrollButton').disabled=false;message('joinStatus',e.message+($('entry').value==='account'?' Entre na sua conta pelo cabeçalho do site.':''));}
});
$('copyClaim').addEventListener('click',async()=>{try{await copy(privateUrl(activeClaim.id,'claim',activeClaim.token));message('claimStatus','Acesso individual copiado.');}catch(e){message('claimStatus',e.message);}});
$('checkResult').addEventListener('click',async()=>{
 try{const data=activeClaim.entry==='account'?await request('/account/events/'+activeClaim.id+'/my-result',{}):await request('/events/'+activeClaim.id+'/claim-reveal',{claimToken:activeClaim.token});message('result','Olá, '+data.giver+'! Você tirou: '+data.recipient+'.');}
 catch(e){message('result',e.message);}
});

$('audit').addEventListener('click',async()=>{
 if(!activeEvent||activeEvent.privacy!=='supervised')return;
 $('audit').disabled=true;
 try{
  const data=await request('/account/events/'+activeEvent.id+'/assignments',{});
  const target=$('auditResults');target.replaceChildren();
  const heading=document.createElement('h3');heading.textContent='Resultados supervisionados';target.append(heading);
  const list=document.createElement('ul');
  for(const pair of data.assignments){
   const item=document.createElement('li');item.textContent=pair.giver+' → '+pair.recipient;list.append(item);
  }
  target.append(list);show('auditResults');
 }catch(e){message('manageStatus',e.message);}
 finally{$('audit').disabled=false;}
});

function manageEvent(data){
 activeEvent=data;hide('organizer');hide('myEvents');show('manage');
 const closed=data.enrollmentClosed||data.status!=='draft';
 $('close').disabled=closed;
 $('draw').disabled=data.status!=='draft'||!data.enrollmentClosed;
 $('rotateInvite').disabled=closed;
 const available=Boolean(data.inviteToken);
 $('share').disabled=!available;$('copy').disabled=!available;
 if(data.status==='drawn'&&data.privacy==='supervised')show('audit');
 else hide('audit');
 message('manageStatus',data.status==='drawn'?'Sorteio realizado.':data.enrollmentClosed?'Inscrições encerradas. Você pode realizar o sorteio.':available?'Convite disponível para compartilhar.':'Evento recuperado. Gere um novo convite para continuar convidando pessoas; os convites anteriores serão invalidados.');
}
$('loadEvents').addEventListener('click',async()=>{
 $('loadEvents').disabled=true;
 try{
  const data=await request('/account/events',null,'GET');
  const target=$('eventList');target.replaceChildren();
  if(!data.events.length){message('eventListStatus','Nenhum evento encontrado.');return;}
  message('eventListStatus','Escolha um evento para gerenciar.');
  for(const item of data.events){
   const button=document.createElement('button');button.type='button';
   button.textContent=item.title+' — '+(item.status==='drawn'?'sorteado':'em andamento');
   button.addEventListener('click',async()=>{
    try{const info=await request('/account/events/'+item.id+'/manage',null,'GET');manageEvent(info);}
    catch(error){message('eventListStatus',error.message);}
   });
   target.append(button,document.createTextNode(' '));
  }
 }catch(e){message('eventListStatus',e.message);}
 finally{$('loadEvents').disabled=false;}
});
$('rotateInvite').addEventListener('click',async()=>{
 if(!activeEvent||!confirm('Gerar um novo convite? Os links de convite anteriores deixarão de funcionar.'))return;
 $('rotateInvite').disabled=true;
 try{
  const data=await request('/account/events/'+activeEvent.id+'/rotate-invite',{});
  activeEvent.inviteToken=data.inviteToken;
  $('share').disabled=false;$('copy').disabled=false;
  message('manageStatus','Novo convite gerado. Compartilhe-o com o grupo. Os convites antigos foram invalidados.');
 }catch(e){message('manageStatus',e.message);}
 finally{if(activeEvent.status==='draft'&&!activeEvent.enrollmentClosed)$('rotateInvite').disabled=false;}
});
