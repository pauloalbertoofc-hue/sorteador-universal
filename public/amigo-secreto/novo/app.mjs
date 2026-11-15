const $=id=>document.getElementById(id);
const api='/api/secret-santa',hash=new URLSearchParams(location.hash.slice(1));
const eventId=hash.get('event'),inviteToken=hash.get('invite'),claimToken=hash.get('claim');
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
 hide('organizer');
 if(!uuid.test(eventId||'')||(!secret.test(inviteToken||'')&&!secret.test(claimToken||''))){show('join');message('joinStatus','Convite ou acesso inválido.');}
 else if(secret.test(claimToken||'')){
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
  activeEvent=data;hide('organizer');show('manage');message('manageStatus','Evento criado. Convide os participantes.');
 }catch(error){message('createStatus',error.message+' Use o acesso à conta no cabeçalho do site para entrar.');}
 finally{$('createButton').disabled=false;}
});
$('copy').addEventListener('click',async()=>{try{await copy(privateUrl(activeEvent.id,'invite',activeEvent.inviteToken));message('manageStatus','Convite copiado.');}catch(e){message('manageStatus',e.message);}});
$('share').addEventListener('click',async()=>{try{const text='Entre no nosso amigo secreto: '+privateUrl(activeEvent.id,'invite',activeEvent.inviteToken);if(navigator.share)await navigator.share({text});else await copy(text);}catch(e){if(e.name!=='AbortError')message('manageStatus',e.message);}});
$('close').addEventListener('click',async()=>{
 if(!confirm('Encerrar inscrições? Não será possível adicionar mais participantes.'))return;
 $('close').disabled=true;
 try{const data=await request('/account/events/'+activeEvent.id+'/close-enrollment',{});message('manageStatus','Inscrições encerradas com '+data.participants+' participantes.');$('draw').disabled=false;}
 catch(e){$('close').disabled=false;message('manageStatus',e.message);}
});
$('draw').addEventListener('click',async()=>{
 if(!confirm('Realizar sorteio agora?'))return;
 $('draw').disabled=true;
 try{const data=await request('/account/events/'+activeEvent.id+'/draw',{});message('manageStatus','Sorteio realizado para '+data.participants+' participantes. Cada um pode consultar seu próprio acesso.');}
 catch(e){$('draw').disabled=false;message('manageStatus',e.message);}
});
$('enroll').addEventListener('submit',async event=>{
 event.preventDefault();$('enrollButton').disabled=true;
 try{
  const data=await request('/events/'+eventId+'/enroll',{inviteToken,name:$('name').value.trim(),entry:$('entry').value});
  if(!secret.test(data.claimToken||''))throw Error('Resposta de inscrição sem credencial válida.');
  activeClaim={id:eventId,token:data.claimToken};
  history.replaceState(null,'',privateUrl(eventId,'claim',data.claimToken));
  hide('join');show('claim');message('claimStatus','Inscrição confirmada. Guarde seu acesso antes de sair.');
 }catch(e){$('enrollButton').disabled=false;message('joinStatus',e.message+($('entry').value==='account'?' Entre na sua conta pelo cabeçalho do site.':''));}
});
$('copyClaim').addEventListener('click',async()=>{try{await copy(privateUrl(activeClaim.id,'claim',activeClaim.token));message('claimStatus','Acesso individual copiado.');}catch(e){message('claimStatus',e.message);}});
$('checkResult').addEventListener('click',async()=>{
 try{const data=await request('/events/'+activeClaim.id+'/claim-reveal',{claimToken:activeClaim.token});message('result','Olá, '+data.giver+'! Você tirou: '+data.recipient+'.');}
 catch(e){message('result',e.message);}
});
