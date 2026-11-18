import{SU_THEMES,SU_DEFAULT_THEME,setSuTheme,themeFromUrl,enableThemeNavigation}from'./themes.mjs';
/** Additive homepage pilot; do not mount in embedded tools or private rooms. */
function mount(){
 const url=new URL(location.href);
 if(url.searchParams.get('incorporado')==='1'){
  if(url.searchParams.has('suTheme')){document.body.classList.add('su-home-themed');setSuTheme(document.body,themeFromUrl(location.href));}
  window.addEventListener('message',event=>{
   if(event.origin!==location.origin||event.data?.type!=='su:set-embed-theme'||!SU_THEMES.includes(event.data.theme))return;
   document.body.classList.add('su-home-themed');setSuTheme(document.body,event.data.theme);
  });
  return;
 }
 if(url.searchParams.has('room')||url.searchParams.has('evento')||url.searchParams.has('event'))return;
 const main=document.querySelector('main.wrap'),top=main?.querySelector('.top'),header=main?.querySelector('header');
 if(!main||!top||!header||main.querySelector('.su-home-directory'))return;
 document.body.classList.add('su-home-themed');setSuTheme(document.body,themeFromUrl(location.href));
 const picker=document.createElement('div');picker.className='su-home-themes';
 const label=document.createElement('label');label.htmlFor='su-home-theme';label.textContent='Aparência';
 const select=document.createElement('select');select.id='su-home-theme';
 const names={classic:'01 — Clássico',modern:'02 — Moderno',amethyst:'03 — Ametista',ruby:'04 — Rubi',crystal:'05 — Cristal',abyssal:'06 — Abissal',original:'07 — Original'};
 for(const id of SU_THEMES)select.add(new Option(names[id],id));
 select.value=themeFromUrl(location.href);select.addEventListener('change',()=>setSuTheme(document.body,select.value));
 picker.append(label,select);top.append(picker);
 const section=document.createElement('section');section.className='su-home-directory';section.setAttribute('aria-label','Explorar ferramentas');
 const heading=document.createElement('h2');heading.textContent='Escolha uma ferramenta';section.append(heading);
 const intro=document.createElement('p');intro.className='su-home-directory-intro';intro.textContent='Acesse diretamente a ferramenta que você precisa ou use o sorteador rápido nesta página.';section.append(intro);
 const nav=document.createElement('nav');nav.className='su-home-grid';nav.setAttribute('aria-label','Catálogo de ferramentas');
 const items=[['/sortear-nomes/','Sorteio de nomes','Selecione participantes'],['/sortear-numeros/','Sorteio de números','Defina um intervalo'],['/roleta-online/','Roleta online','Gire para decidir'],['/sortear-equipes/','Sortear equipes','Monte grupos'],['/sorteio-rifa-online/','Sorteio de rifa','Sorteie números'],['/cara-ou-coroa-online/','Cara ou coroa','Decida rapidamente'],['/sortear-aluno-online/','Sortear aluno','Dinâmicas de aula'],['/dividir-turma-em-grupos/','Dividir turma','Organize os grupos']];
 for(const [href,name,description] of items){const a=document.createElement('a');a.href=href;const strong=document.createElement('strong');strong.textContent=name;const small=document.createElement('span');small.textContent=description;a.append(strong,small);nav.append(a)}
 section.append(nav);
 const duplicateDirectory=main.querySelector('.tool-directory');
 if(duplicateDirectory){duplicateDirectory.hidden=true;duplicateDirectory.setAttribute('aria-hidden','true');}
 const shortcut=document.createElement('a');shortcut.className='su-home-quick-link';shortcut.href='#su-home-quick-draw';shortcut.textContent='Usar sorteador rápido nesta página';section.append(shortcut);
 const quickTabs=main.querySelector('.tabs');if(quickTabs)quickTabs.id='su-home-quick-draw';
 header.after(section); 
 // Classic reference pilot: real navigation and a compact illustrated hero.
 const art=document.createElement('div');art.className='su-classic-art';art.setAttribute('aria-hidden','true');
 art.innerHTML='<svg viewBox="0 0 300 210" xmlns="http://www.w3.org/2000/svg"><ellipse cx="155" cy="180" rx="108" ry="17" fill="#91b9ee" opacity=".25"/><circle cx="155" cy="105" r="97" fill="#e3efff"/><g stroke="#2165bc" stroke-width="3" stroke-linejoin="round"><path d="M75 64 166 29 235 72 144 110Z" fill="#fff"/><path d="M75 64 144 110 144 185 75 137Z" fill="#e0edff"/><path d="M144 110 235 72 235 145 144 185Z" fill="#bdd7fa"/></g><g fill="#173d70"><ellipse cx="155" cy="70" rx="9" ry="6"/><ellipse cx="100" cy="96" rx="6" ry="9"/><ellipse cx="124" cy="147" rx="6" ry="9"/><ellipse cx="166" cy="126" rx="7" ry="9"/><ellipse cx="211" cy="100" rx="7" ry="9"/><ellipse cx="188" cy="135" rx="7" ry="9"/><ellipse cx="166" cy="160" rx="7" ry="9"/><ellipse cx="211" cy="145" rx="7" ry="9"/></g></svg>';
 const hero=document.createElement('div');hero.className='su-classic-copy';
 hero.innerHTML='<span class="su-classic-eyebrow">Sorteios, roletas e muito mais</span><h2>O que você quer sortear hoje?</h2><p>Ferramentas simples, rápidas e confiáveis para organizar sorteios e atividades em grupo.</p><div class="su-classic-actions"><a href="#su-catalog">Explorar ferramentas →</a><a href="#ajuda">Como funciona</a></div>';
 const heroLayout=document.createElement('div');heroLayout.className='su-classic-hero';heroLayout.append(hero,art);header.append(heroLayout);
 section.id='su-catalog';
 const menu=document.createElement('nav');menu.className='su-classic-menu';menu.setAttribute('aria-label','Navegação principal');menu.innerHTML='<a href="#su-catalog">Ferramentas</a><a href="#roomStudio" data-su-open=".su-room-toggle">Salas</a><a href="#ajuda">Ajuda</a><a href="#conta">Minha conta</a>';top.insertBefore(menu,picker);
 menu.addEventListener('click',event=>{const a=event.target.closest('a[data-su-open]');if(a){const b=main.querySelector(a.dataset.suOpen);if(b?.getAttribute('aria-expanded')==='false')b.click();}});
 const glyphs=['♧','123','◉','♧','▱','◐','◇','▦'];
 [...nav.children].forEach((a,i)=>{const glyph=document.createElement('span');glyph.className='su-classic-glyph';glyph.setAttribute('aria-hidden','true');glyph.textContent=glyphs[i];a.prepend(glyph);});
 const logo=top.querySelector('.logo');if(logo){const mark=document.createElement('span');mark.className='su-classic-mark';mark.setAttribute('aria-hidden','true');mark.textContent='⚄';logo.after(mark);}

 const room=main.querySelector('#roomStudio');
 if(room){
  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='su-room-toggle';toggle.setAttribute('aria-controls','roomStudio');
  const roomActive=room.querySelector('#roomActive');
  const hasActiveRoom=()=>Boolean(roomActive&&!roomActive.hidden);
  let expanded=hasActiveRoom();
  const render=()=>{
   room.hidden=!expanded;
   toggle.setAttribute('aria-expanded',String(expanded));
   toggle.textContent=expanded?'Ocultar salas compartilhadas':'Criar ou acessar sala compartilhada';
  };
  toggle.addEventListener('click',()=>{expanded=!expanded;render()});
  room.before(toggle);render();
  if(roomActive){
   const observer=new MutationObserver(()=>{
    if(hasActiveRoom()&&!expanded){expanded=true;render()}
   });
   observer.observe(roomActive,{attributes:true,attributeFilter:['hidden']});
  }
 }
 const account=main.querySelector('#conta');
 if(account){
  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='su-account-toggle';toggle.setAttribute('aria-controls','conta');
  const member=account.querySelector('#accountMember');
  let expanded=Boolean(member&&!member.hidden)||url.hash==='#conta';
  const render=()=>{
   account.hidden=!expanded;
   toggle.setAttribute('aria-expanded',String(expanded));
   toggle.textContent=expanded?'Ocultar minha conta':'Minha conta e assinatura';
  };
  toggle.addEventListener('click',()=>{expanded=!expanded;render()});
  account.before(toggle);render();
  if(member)new MutationObserver(()=>{
   if(!member.hidden&&!expanded){expanded=true;render()}
  }).observe(member,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('hashchange',()=>{
   if(location.hash==='#conta'&&!expanded){expanded=true;render()}
  });
 }
 const history=main.querySelector('.history');
 if(history){
  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='su-history-toggle';toggle.setAttribute('aria-controls','su-home-history');
  history.id='su-home-history';
  const entries=history.querySelector('#history');
  const hasEntries=()=>Boolean(entries?.querySelector('.history-item-actions'));
  let expanded=hasEntries()||url.hash==='#su-home-history';
  const render=()=>{
   history.hidden=!expanded;
   toggle.setAttribute('aria-expanded',String(expanded));
   toggle.textContent=expanded?'Ocultar histórico':'Ver histórico recente';
  };
  toggle.addEventListener('click',()=>{expanded=!expanded;render()});
  history.before(toggle);render();
  if(entries)new MutationObserver(()=>{
   if(hasEntries()&&!expanded){expanded=true;render()}
  }).observe(entries,{childList:true});
  window.addEventListener('hashchange',()=>{
   if(location.hash==='#su-home-history'&&!expanded){expanded=true;render()}
  });
 }
 enableThemeNavigation(document,()=>document.body.getAttribute('data-su-theme'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
