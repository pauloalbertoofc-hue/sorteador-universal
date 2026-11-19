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
 art.innerHTML='<svg viewBox="0 0 360 260" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="suDieTop" x2=".7" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#dceaff"/></linearGradient><linearGradient id="suDieLeft" x2="1" y2="1"><stop stop-color="#f7fbff"/><stop offset="1" stop-color="#a8c8ef"/></linearGradient><linearGradient id="suDieRight" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4f9ff"/><stop offset="1" stop-color="#719bd5"/></linearGradient><radialGradient id="suDieHalo"><stop stop-color="#fff"/><stop offset="1" stop-color="#cbdfff"/></radialGradient><filter id="suDieBlur"><feGaussianBlur stdDeviation="8"/></filter><radialGradient id="suDiePip"><stop stop-color="#102746"/><stop offset=".75" stop-color="#173b6c"/><stop offset="1" stop-color="#7394bd"/></radialGradient></defs><path d="M33 170Q-5 100 86 49T281 23Q350 68 328 155T202 238Q79 255 33 170" fill="url(#suDieHalo)" opacity=".8"/><ellipse cx="187" cy="222" rx="101" ry="15" fill="#254e91" opacity=".29" filter="url(#suDieBlur)"/><g transform="rotate(-12 180 130)" stroke="#729bd1" stroke-width="1.4" stroke-linejoin="round"><path d="M91 64Q83 69 84 80L84 168Q84 179 94 185L164 226Q173 231 181 225L181 121Z" fill="url(#suDieLeft)"/><path d="M181 121L279 64Q289 69 289 80L289 160Q289 171 278 178L181 225Q172 230 172 218L172 132Z" fill="url(#suDieRight)"/><path d="M91 64L178 20Q187 15 197 21L279 64Q290 70 280 77L191 126Q180 132 169 126L91 79Q79 72 91 64Z" fill="url(#suDieTop)"/><path d="M96 67L180 25Q187 22 195 26L272 67" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M91 86V164Q91 172 98 177" fill="none" stroke="#fff" stroke-width="3" opacity=".75"/><g fill="url(#suDiePip)" stroke="#fff" stroke-width=".8"><ellipse cx="139" cy="62" rx="10" ry="6" transform="rotate(-8 139 62)"/><ellipse cx="185" cy="80" rx="10" ry="6"/><ellipse cx="231" cy="62" rx="10" ry="6"/><ellipse cx="107" cy="104" rx="7" ry="11" transform="rotate(-24 107 104)"/><ellipse cx="147" cy="194" rx="7" ry="11" transform="rotate(-24 147 194)"/><ellipse cx="127" cy="149" rx="7" ry="11" transform="rotate(-24 127 149)"/><ellipse cx="204" cy="139" rx="8" ry="11" transform="rotate(25 204 139)"/><ellipse cx="264" cy="107" rx="8" ry="11" transform="rotate(25 264 107)"/><ellipse cx="234" cy="149" rx="8" ry="11" transform="rotate(25 234 149)"/><ellipse cx="204" cy="189" rx="8" ry="11" transform="rotate(25 204 189)"/><ellipse cx="264" cy="157" rx="8" ry="11" transform="rotate(25 264 157)"/></g></g><g stroke="#4285d9" stroke-width="4" stroke-linecap="round"><path d="M66 53 54 37M79 39 75 18M49 70 30 65"/></g></svg>';
 const hero=document.createElement('div');hero.className='su-classic-copy';
 hero.innerHTML='<span class="su-classic-eyebrow">Sorteios, roletas e muito mais</span><h2>O que você quer sortear hoje?</h2><p>Ferramentas simples, rápidas e confiáveis para organizar sorteios e atividades em grupo.</p><div class="su-classic-actions"><a href="#su-catalog">Explorar ferramentas →</a><a href="#ajuda">Como funciona</a></div>';
 const heroLayout=document.createElement('div');heroLayout.className='su-classic-hero';heroLayout.append(hero,art);header.append(heroLayout);
// Load the interactive hero only when the classic theme is selected.
 let classicDieRequested=false;
 const loadClassicDie=()=>{
  if(classicDieRequested||document.body.dataset.suTheme!=='classic')return;
  classicDieRequested=true;
  import('./classic-die.mjs').then(m=>m.mountClassicDie(art)).catch(()=>{});
 };
 select.addEventListener('change',loadClassicDie);loadClassicDie();

 section.id='su-catalog';
 const menu=document.createElement('nav');menu.className='su-classic-menu';menu.setAttribute('aria-label','Navegação principal');menu.innerHTML='<a href="#su-catalog">Ferramentas</a><a href="#roomStudio" data-su-open=".su-room-toggle">Salas</a><a href="#su-plans">Planos</a><a href="#ajuda">Ajuda</a><a href="#conta">Minha conta</a>';top.insertBefore(menu,picker);
 menu.addEventListener('click',event=>{const a=event.target.closest('a[data-su-open]');if(a){const b=main.querySelector(a.dataset.suOpen);if(b?.getAttribute('aria-expanded')==='false')b.click();}});
 const svgIcon=paths=>'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
 const people='<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3zM5 5a3 3 0 0 0 0 6M19 5a3 3 0 0 1 0 6M4 14a5 5 0 0 0-3 5M20 14a5 5 0 0 1 3 5"/>';
 const glyphs=[people,'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 10l2-2v8M11 9q5-3 4 2l-4 5h5M18 8h3l-2 4 2 2-2 2"/>','<circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/>',people,'<path d="M3 7 18 3l3 5a3 3 0 0 0 1 6l-16 5-3-5a3 3 0 0 0 0-7zM14 5l4 11" stroke-dasharray="0"/>','<circle cx="12" cy="12" r="10"/><path d="M8 17V7l6 3-6 4M16 7v10"/>','<path d="m2 9 10-5 10 5-10 5zM6 11v6q6 5 12 0v-6M22 9v8"/>',people];
 [...nav.children].forEach((a,i)=>{const glyph=document.createElement('span');glyph.className='su-classic-glyph';glyph.setAttribute('aria-hidden','true');glyph.innerHTML=svgIcon(glyphs[i]);a.prepend(glyph);});
 const logo=top.querySelector('.logo');if(logo){const mark=document.createElement('span');mark.className='su-classic-mark';mark.setAttribute('aria-hidden','true');mark.innerHTML=svgIcon('<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/><g fill="currentColor" stroke="none"><circle cx="12" cy="6" r="1.3"/><circle cx="7" cy="12" r="1.3"/><circle cx="17" cy="12" r="1.3"/><circle cx="7" cy="16" r="1.3"/><circle cx="17" cy="17" r="1.3"/></g>');logo.after(mark);}
 const menuButton=document.createElement('button');menuButton.type='button';menuButton.className='su-classic-menu-button';menuButton.textContent='Menu';menu.id='su-classic-menu';menuButton.setAttribute('aria-controls',menu.id);menuButton.setAttribute('aria-expanded','false');menu.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.classList.remove('su-menu-open');menuButton.setAttribute('aria-expanded','false');menuButton.focus();}});menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(open));menu.classList.toggle('su-menu-open',open)});top.insertBefore(menuButton,menu);

 const profile=document.createElement('button');profile.type='button';profile.className='su-classic-profile';profile.setAttribute('aria-label','Minha conta');profile.setAttribute('aria-expanded','false');profile.setAttribute('aria-controls','su-profile-popover');
 const guestIcon=svgIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="9" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/>');profile.innerHTML=guestIcon;top.append(profile);
 const pop=document.createElement('nav');pop.id='su-profile-popover';pop.className='su-profile-popover';pop.setAttribute('aria-label','Opções da conta');pop.hidden=true;top.append(pop);
 const closeProfile=(focus=false)=>{pop.hidden=true;profile.setAttribute('aria-expanded','false');if(focus)profile.focus();};
 profile.addEventListener('click',()=>{if(!pop.hidden){closeProfile();return;}pop.hidden=false;profile.setAttribute('aria-expanded','true');});
 document.addEventListener('pointerdown',e=>{if(!pop.contains(e.target)&&!profile.contains(e.target))closeProfile();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!pop.hidden)closeProfile(true);});
 pop.addEventListener('click',e=>{const action=e.target.closest('[data-profile-action]');if(!action)return;closeProfile();if(action.dataset.profileAction==='logout')document.querySelector('#accountLogout')?.click();if(action.dataset.profileAction==='settings'){if(menuButton.getAttribute('aria-expanded')!=='true')menuButton.click();select.focus();}});
 const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='su-classic-backdrop';backdrop.setAttribute('aria-label','Fechar menu');top.append(backdrop);
 const close=document.createElement('button');close.type='button';close.className='su-classic-menu-close';close.setAttribute('aria-label','Fechar menu');close.textContent='×';menu.prepend(close);
 const drawerLink=(href,title,icon)=>'<a href="'+href+'">'+svgIcon(icon)+'<span>'+title+'</span></a>';
 const drawerHeading=title=>'<p class="su-drawer-heading">'+title+'</p>';
 const shortcuts=items.map(([href,title],i)=>drawerLink(href,title,glyphs[i])).join('');
 menu.innerHTML='';
 const brand=document.createElement('div');brand.className='su-drawer-brand';brand.innerHTML='<strong>Sorteador Universal</strong>';brand.prepend(top.querySelector('.su-classic-mark')?.cloneNode(true)||document.createElement('span'));brand.append(close);menu.append(brand);
 const links=document.createElement('div');links.className='su-drawer-links';
 links.innerHTML=drawerHeading('Navegação')+drawerLink('#su-catalog','Início','<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>')+'<details class="su-drawer-tools"><summary>'+svgIcon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>')+'<span>Ferramentas</span><span class="su-drawer-chevron" aria-hidden="true">›</span></summary><div>'+shortcuts+drawerLink('/amigo-secreto/','Amigo secreto','<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8C2 8 6-1 12 8c6-9 10 0 0 0"/>')+drawerLink('#su-home-quick-draw','Sorteador rápido','<path d="m13 2-9 12h7l-1 8 10-12h-8z"/>')+'</div></details>'+drawerLink('#roomStudio','Salas compartilhadas',people)+drawerHeading('Conta e serviços')+drawerLink('#conta','Minha conta','<circle cx="12" cy="7" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>')+drawerLink('#su-home-history','Histórico','<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>')+drawerLink('#su-plans','Planos e assinatura','<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>')+drawerHeading('Preferências')+drawerLink('#ajuda','Ajuda e suporte','<circle cx="12" cy="12" r="10"/><path d="M9 8a3 3 0 1 1 3 4v2M12 18h.01"/>');
 menu.append(links);
 const updateDrawerActive=()=>{const current=location.hash||'#su-catalog';menu.querySelectorAll('a').forEach(a=>{if(a.getAttribute('href')===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});};
 window.addEventListener('hashchange',updateDrawerActive);updateDrawerActive();
  menuButton.innerHTML=svgIcon('<path d="M3 6h18M3 12h18M3 18h18"/>');menuButton.setAttribute('aria-label','Menu');
 const closeDrawer=()=>{menu.classList.remove('su-menu-open');menuButton.setAttribute('aria-expanded','false');menuButton.focus();};
 close.addEventListener('click',closeDrawer);backdrop.addEventListener('click',closeDrawer);
 menu.addEventListener('click',e=>{if(e.target.closest('a')){menu.classList.remove('su-menu-open');menuButton.setAttribute('aria-expanded','false');}});
 const relocatePicker=()=>{if(document.body.dataset.suTheme==='classic')menu.append(picker);else top.append(picker);};
 select.addEventListener('change',relocatePicker);relocatePicker();
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
  const banner=document.createElement('section');banner.className='su-classic-room-banner';
  banner.innerHTML='<div><h2>Sorteiem juntos, de onde estiverem</h2><p>Crie uma sala compartilhada, convide participantes e acompanhe o sorteio com seu grupo.</p><a href="#roomStudio">Criar ou acessar sala →</a></div><svg aria-hidden="true" viewBox="0 0 240 120" fill="none"><circle cx="120" cy="60" r="53" fill="#ffffff" opacity=".12"/><path d="M33 91Q33 62 62 62T91 91M149 91Q149 62 178 62T207 91" fill="#a9d2ff"/><circle cx="62" cy="45" r="17" fill="#d9eaff"/><circle cx="178" cy="45" r="17" fill="#d9eaff"/><path d="M83 104Q83 64 120 64T157 104" fill="white"/><circle cx="120" cy="42" r="23" fill="white"/><path d="M62 18L120 9L178 18" stroke="white" opacity=".5" stroke-dasharray="4 6"/></svg>';
  banner.querySelector('a').addEventListener('click',()=>{if(!expanded){expanded=true;render();}});
  toggle.before(banner);

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
 // Classic navigation separates the exploration page from the quick draw and legal/help content.
 const plans=document.createElement('section');plans.id='su-plans';plans.className='su-classic-plans';plans.innerHTML='<h2>Escolha seu plano</h2><p>Faça sorteios gratuitamente ou conheça o Estúdio Pro.</p><div class="su-plan-grid"><article><h3>Gratuito</h3><strong>R$ 0</strong><ul><li>Sorteios sem cadastro</li><li>Histórico local</li><li>Publicidade</li></ul><a href="#su-catalog">Explorar ferramentas</a></article><article><h3>Pro</h3><strong>R$ 4,90/mês</strong><ul><li>Sem anúncios com assinatura ativa</li><li>Estúdio Pro e listas salvas</li><li>Cobrança recorrente pelo Mercado Pago, quando disponível</li></ul><a href="#conta">Consultar assinatura</a></article></div>';main.querySelector('.foot').before(plans);
 const views={'#su-home-quick-draw':'draw','#ajuda':'help','#privacidade':'privacy','#roomStudio':'rooms','#conta':'account','#su-register':'account','#su-lists':'account','#su-subscription':'account','#su-plans':'plans','#su-home-history':'history'};
 const back=document.createElement('a');back.className='su-classic-back';back.href='#su-catalog';back.textContent='← Voltar ao início';top.after(back);
 const side=document.createElement('nav');side.className='su-classic-account-nav';side.setAttribute('aria-label','Menu da conta');
 side.innerHTML='<strong>Minha área</strong><a href="#conta">Minha conta</a><a href="#su-home-history">Histórico</a><a href="#su-plans">Plano e assinatura</a><a href="#roomStudio">Salas compartilhadas</a><a href="#ajuda">Ajuda</a>';
 back.after(side);
 if(account){
  const overview=document.createElement('div');overview.className='su-classic-account-overview';
  const title=document.createElement('h2');title.textContent='Minha conta';
  const intro=document.createElement('p');intro.textContent='Gerencie seu perfil, histórico e assinatura.';
  const card=document.createElement('div');card.className='su-classic-profile-card';
  card.innerHTML=svgIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="9" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/>')+'<div><strong></strong><small></small></div>';
  const update=()=>{const member=account.querySelector('#accountMember');const signed=member&&!member.hidden;card.querySelector('strong').textContent=signed?(account.querySelector('#accountIdentity').textContent||'Minha conta'):'Visitante';card.querySelector('small').textContent=signed?(account.querySelector('#subscriptionState').textContent||'Consulte sua assinatura'):'Entre ou crie sua conta';};
  overview.append(title,intro,card);account.prepend(overview);
  const refreshProfile=()=>{const signed=!account.querySelector('#accountMember').hidden;const identity=account.querySelector('#accountIdentity').textContent.trim();main.dataset.suSigned=String(signed);profile.innerHTML=signed?'':guestIcon;if(signed)profile.textContent=(identity.match(/[\\p{L}\\p{N}]/u)?.[0]||'U').toUpperCase();profile.classList.toggle('su-profile-signed',signed);
   pop.innerHTML='<strong>Minha conta</strong><small></small><hr>'+(signed?'<a href="#conta" data-profile-action="route">Meu perfil</a><a href="#su-home-history" data-profile-action="route">Histórico</a><a href="#su-lists" data-profile-action="route">Listas salvas</a><a href="#roomStudio" data-profile-action="route">Minhas salas</a><a href="#su-subscription" data-profile-action="route">Minha assinatura</a>':'<a class="su-profile-primary" href="#conta" data-profile-action="route">Entrar na minha conta</a><a href="#su-register" data-profile-action="route">Criar conta</a><a href="#su-home-history" data-profile-action="route">Histórico</a>')+'<button type="button" data-profile-action="settings">Configurações</button>'+(signed?'<hr><button type="button" data-profile-action="logout">Sair</button>':'');pop.querySelector('small').textContent=signed?(identity||'Minha conta'):'Visitante';
  };
  new MutationObserver(refreshProfile).observe(account.querySelector('#accountMember'),{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true,characterData:true});refreshProfile();
  const auth=document.createElement('div');auth.className='su-auth-intro';auth.innerHTML='<h2>Acesse sua conta</h2><p>Entre para acessar os recursos da sua conta.</p>';account.querySelector('#accountGuest').prepend(auth);
  const authHero=document.createElement('section');authHero.className='su-auth-hero';authHero.innerHTML='<strong>Sorteador Universal</strong><h2>Entrar na minha conta</h2><p>Acesse seu histórico, listas salvas, salas e muito mais.</p><div class="su-auth-die" aria-hidden="true">'+svgIcon('<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/><g fill="currentColor" stroke="none"><circle cx="12" cy="6" r="1"/><circle cx="7" cy="12" r="1"/><circle cx="17" cy="16" r="1"/></g>')+'</div>';account.querySelector('#accountGuest').before(authHero);
  const authDie=authHero.querySelector('.su-auth-die');let authDieMounted=false;
  const mountAuthDie=()=>{if(authDieMounted||!authDie.getBoundingClientRect().width)return;authDieMounted=true;import('./classic-die.mjs').then(m=>m.mountClassicDie(authDie)).catch(()=>{authDieMounted=false;});};
  new ResizeObserver(mountAuthDie).observe(authDie);
  authHero.querySelector('strong').prepend(authDie.querySelector('svg').cloneNode(true));

  const password=account.querySelector('#accountPassword'),email=account.querySelector('#accountEmail');
  const guest=account.querySelector('#accountGuest');
  const recovery=document.createElement('dialog');recovery.className='su-recovery';recovery.setAttribute('aria-labelledby','su-recovery-title');recovery.innerHTML='<form><h2 id="su-recovery-title">Recuperar senha</h2><p>Informe seu e-mail para receber as instruções.</p><label>E-mail<input type="email" required autocomplete="email" maxlength="254"></label><label hidden>Nova senha<input type="password" autocomplete="new-password" minlength="10" maxlength="128"></label><p role="status" aria-live="polite"></p><button type="submit">Enviar instruções</button> <button type="button" class="secondary">Voltar</button></form>';
  document.body.append(recovery);
  const rf=recovery.querySelector('form'),re=recovery.querySelector('input[type=email]'),rp=recovery.querySelector('input[type=password]'),rs=recovery.querySelector('[role=status]'),rb=recovery.querySelector('[type=submit]');
  let resetToken='',recoveryEpoch=0;
  function openRecovery(token=''){recoveryEpoch++;rb.disabled=false;rb.hidden=false;rp.disabled=false;resetToken=token;rf.reset();rs.textContent='';re.value=email.value;re.parentElement.hidden=!!token;re.required=!token;rp.parentElement.hidden=!token;rp.required=!!token;recovery.querySelector('h2').textContent=token?'Criar nova senha':'Recuperar senha';recovery.querySelector('h2+p').textContent=token?'Escolha uma senha com pelo menos 10 caracteres.':'Informe seu e-mail para receber as instruções.';rb.textContent=token?'Redefinir senha':'Enviar instruções';re.autofocus=!token;rp.autofocus=!!token;if(!recovery.open)recovery.showModal();const field=token?rp:re,epoch=recoveryEpoch;field.focus({preventScroll:true});requestAnimationFrame(()=>{if(recovery.open&&epoch===recoveryEpoch)field.focus({preventScroll:true});});}
  const forgot=document.createElement('button');forgot.type='button';forgot.className='su-forgot-password';forgot.textContent='Esqueceu sua senha?';guest.querySelector('.account-actions').before(forgot);forgot.addEventListener('click',()=>openRecovery());
  recovery.querySelector('[type=button]').addEventListener('click',()=>recovery.close());
  recovery.addEventListener('close',()=>{if(recovery.open)return;recoveryEpoch++;resetToken='';rf.reset();if(forgot.getClientRects().length)forgot.focus();});
  rf.addEventListener('submit',async e=>{
   e.preventDefault();if(!recovery.open||rb.disabled||rb.hidden)return;
   const epoch=recoveryEpoch,token=resetToken;rb.disabled=true;rs.textContent='Processando…';
   const current=()=>recovery.open&&epoch===recoveryEpoch;
   try{
    const response=await fetch(token?'/api/password/reset':'/api/password/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(token?{token,password:rp.value}:{email:re.value})});
    const data=await response.json().catch(()=>null);if(!current())return;
    if(!response.ok||!data?.ok){rs.textContent=typeof data?.error==='string'?data.error:'Não foi possível concluir. Tente novamente.';return;}
    rs.textContent=token?'Senha redefinida. Volte para entrar.':data.message;rp.value='';
    if(token){resetToken='';rb.hidden=true;rp.disabled=true;recovery.querySelector('[type=button]').focus();}
   }catch{if(current())rs.textContent='Não foi possível conectar. Tente novamente.';}
   finally{if(current())rb.disabled=false;}
  });
  function consumeRecoveryLink(){const incomingReset=location.hash.match(/^#su-reset=([a-f0-9]{64})$/);if(incomingReset){window.history.replaceState(null,'',location.pathname+location.search+'#conta');openRecovery(incomingReset[1]);}}
  window.addEventListener('hashchange',consumeRecoveryLink);
  const initialRecoveryToken=window.suTakeRecoveryToken?.();
  if(initialRecoveryToken)openRecovery(initialRecoveryToken);else consumeRecoveryLink();

  const wrapField=(input,art)=>{const wrap=document.createElement('span');wrap.className='su-auth-field';input.before(wrap);wrap.innerHTML='<span class="su-auth-field-icon" aria-hidden="true">'+svgIcon(art)+'</span>';wrap.append(input);return wrap;};
  wrapField(email,'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>');
  const passwordWrap=wrapField(password,'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>');
  const reveal=document.createElement('button');reveal.type='button';reveal.className='su-auth-reveal';reveal.setAttribute('aria-pressed','false');reveal.setAttribute('aria-label','Mostrar senha');const eye='<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>';reveal.innerHTML=svgIcon(eye);passwordWrap.append(reveal);reveal.addEventListener('click',()=>{const show=password.type==='password';password.type=show?'text':'password';reveal.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');reveal.setAttribute('aria-pressed',String(show));reveal.innerHTML=svgIcon(eye+(show?'<path d="m3 3 18 18"/>':''));});



  const loginButton=guest.querySelector('#accountLogin'),registerButton=guest.querySelector('#accountRegister'),message=account.querySelector('#accountMessage');
  const confirmation=document.createElement('label');confirmation.hidden=true;confirmation.textContent='Confirme sua senha';
  const confirmPassword=document.createElement('input');confirmPassword.type='password';confirmPassword.autocomplete='new-password';confirmPassword.minLength=10;confirmPassword.maxLength=128;confirmation.append(confirmPassword);guest.querySelector('.account-form').append(confirmation);
  const switchLogin=document.createElement('button');switchLogin.type='button';switchLogin.className='secondary';switchLogin.textContent='Já possui uma conta? Entrar';switchLogin.hidden=true;guest.querySelector('.account-actions').append(switchLogin);
  let registering=false;
  function setRegisterMode(value){registering=value;confirmation.hidden=!value;switchLogin.hidden=!value;loginButton.hidden=value;forgot.hidden=value;registerButton.textContent=value?'Cadastrar':'Criar conta';auth.querySelector('h2').textContent=value?'Crie sua conta':'Acesse sua conta';auth.querySelector('p').textContent=value?'Cadastre seu e-mail e escolha uma senha.':'Entre para acessar os recursos da sua conta.';authHero.querySelector('h2').textContent=value?'Crie sua conta':'Entrar na minha conta';password.autocomplete=value?'new-password':'current-password';confirmPassword.value='';message.textContent='';}
  registerButton.addEventListener('click',event=>{if(!registering){event.preventDefault();event.stopImmediatePropagation();setRegisterMode(true);email.focus();return;}if(!email.validity.valid||!email.value.trim()||password.value.length<10||password.value.length>128||password.value!==confirmPassword.value){event.preventDefault();event.stopImmediatePropagation();message.textContent=password.value!==confirmPassword.value?'As senhas não coincidem.':'Informe um e-mail válido e uma senha de 10 a 128 caracteres.';return;}confirmPassword.value='';},true);
  switchLogin.addEventListener('click',()=>{if(registerButton.disabled)return;setRegisterMode(false);email.focus();});
  const syncAuthRoute=()=>{if(location.hash==='#su-register')setRegisterMode(true);else if(location.hash==='#conta'&&registering)setRegisterMode(false);};
  window.addEventListener('hashchange',syncAuthRoute);syncAuthRoute();
  guest.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('input')){event.preventDefault();(registering?registerButton:loginButton).click();}});
  const memberStatus=account.querySelector('#accountMember');
  const placeMessage=()=>{if(memberStatus.hidden){guest.append(message);}else{account.append(message);if(registering)setRegisterMode(false);}};
  new MutationObserver(placeMessage).observe(memberStatus,{attributes:true,attributeFilter:['hidden']});placeMessage();
  message.setAttribute('aria-live','polite');
  const member=account.querySelector('#accountMember');if(member)new MutationObserver(update).observe(member,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});update();
  side.innerHTML='<strong>Minha área</strong>'+[['#conta','Meus dados','<circle cx="12" cy="7" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>'],['#su-home-history','Histórico de sorteios','<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'],['#roomStudio','Minhas salas',people],['#su-plans','Assinatura e planos','<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>'],['#ajuda','Ajuda','<circle cx="12" cy="12" r="10"/><path d="M9 8a3 3 0 1 1 3 4v2M12 18h.01"/>']].map(([href,label,icon])=>'<a href="'+href+'">'+svgIcon(icon)+'<span>'+label+'</span><i aria-hidden="true">›</i></a>').join('');
 }


 const syncView=()=>{
  const view=views[location.hash]||'home';
  main.dataset.suView=view;main.dataset.suAccountRoute=location.hash.slice(1);closeProfile();
  side.querySelectorAll('a').forEach(a=>{if(a.hash===location.hash)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const control=({rooms:'.su-room-toggle',account:'.su-account-toggle',history:'.su-history-toggle'})[view];
  const toggle=control&&main.querySelector(control);
  if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();
  menu.classList.remove('su-menu-open');menuButton.setAttribute('aria-expanded','false');
  if(document.body.getAttribute('data-su-theme')==='classic'&&view!=='home'){
   const target=main.querySelector(location.hash);
   if(view==='account')requestAnimationFrame(()=>window.scrollTo(0,0));else requestAnimationFrame(()=>target?.scrollIntoView({block:'start'}));
  }
 };
 window.addEventListener('hashchange',syncView);
 select.addEventListener('change',syncView);
 syncView();
 enableThemeNavigation(document,()=>document.body.getAttribute('data-su-theme'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
