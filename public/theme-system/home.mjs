import{SU_THEMES,SU_DEFAULT_THEME,setSuTheme}from'./themes.mjs';
/** Additive homepage pilot; do not mount in embedded tools or private rooms. */
function mount(){
 const url=new URL(location.href);
 if(url.searchParams.get('incorporado')==='1'||url.searchParams.has('room'))return;
 const main=document.querySelector('main.wrap'),top=main?.querySelector('.top'),header=main?.querySelector('header');
 if(!main||!top||!header||main.querySelector('.su-home-directory'))return;
 document.body.classList.add('su-home-themed');setSuTheme(document.body,SU_DEFAULT_THEME);
 const picker=document.createElement('div');picker.className='su-home-themes';
 const label=document.createElement('label');label.htmlFor='su-home-theme';label.textContent='Aparência';
 const select=document.createElement('select');select.id='su-home-theme';
 const names={classic:'01 — Clássico',modern:'02 — Moderno',amethyst:'03 — Ametista',ruby:'04 — Rubi',crystal:'05 — Cristal',abyssal:'06 — Abissal',original:'07 — Original'};
 for(const id of SU_THEMES)select.add(new Option(names[id],id));
 select.value=SU_DEFAULT_THEME;select.addEventListener('change',()=>setSuTheme(document.body,select.value));
 picker.append(label,select);top.append(picker);
 const section=document.createElement('section');section.className='su-home-directory';section.setAttribute('aria-label','Explorar ferramentas');
 const heading=document.createElement('h2');heading.textContent='Explore as ferramentas';section.append(heading);
 const nav=document.createElement('nav');nav.className='su-home-grid';nav.setAttribute('aria-label','Catálogo de ferramentas');
 const items=[['/sortear-nomes/','Sorteio de nomes','Selecione participantes'],['/sortear-numeros/','Sorteio de números','Defina um intervalo'],['/roleta-online/','Roleta online','Gire para decidir'],['/sortear-equipes/','Sortear equipes','Monte grupos'],['/sorteio-rifa-online/','Sorteio de rifa','Sorteie números'],['/cara-ou-coroa-online/','Cara ou coroa','Decida rapidamente'],['/sortear-aluno-online/','Sortear aluno','Dinâmicas de aula'],['/dividir-turma-em-grupos/','Dividir turma','Organize os grupos']];
 for(const [href,name,description] of items){const a=document.createElement('a');a.href=href;const strong=document.createElement('strong');strong.textContent=name;const small=document.createElement('span');small.textContent=description;a.append(strong,small);nav.append(a)}
 section.append(nav);header.after(section);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
