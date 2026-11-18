import {SU_THEMES,SU_DEFAULT_THEME,setSuTheme,themeFromUrl,enableThemeNavigation} from './themes.mjs';
/** Adds shared chrome to an existing SEO landing page without touching its tool iframe. */
export function mountSuSeoShell({root=document.body,main=document.querySelector('main')}={}){
 if(!root||!main)throw new TypeError('A page root and main are required');
 if(main.querySelector('[data-su-nav]'))return;
 root.classList.add('su-integrated');
 setSuTheme(root,themeFromUrl(location.href));
 const nav=document.createElement('nav');nav.className='su-nav';nav.dataset.suNav='';nav.setAttribute('aria-label','Navegação do Sorteador Universal');
 const home=document.createElement('a');home.href='/';home.textContent='✦ Sorteador Universal';
 const label=document.createElement('label');label.textContent='Aparência';
 const select=document.createElement('select');select.setAttribute('aria-label','Selecionar aparência');
 const labels={classic:'01 — Clássico',modern:'02 — Moderno',amethyst:'03 — Ametista',ruby:'04 — Rubi',crystal:'05 — Cristal',abyssal:'06 — Abissal',original:'07 — Original'};
 for(const theme of SU_THEMES)select.add(new Option(labels[theme],theme));
 select.value=themeFromUrl(location.href);
 select.addEventListener('change',()=>setSuTheme(root,select.value));
 label.appendChild(select);nav.append(home,label);main.prepend(nav);
 const iframe=main.querySelector('iframe#sorteador-embed');
 const updateEmbed=()=>{
  if(!iframe)return;
  const url=new URL(iframe.getAttribute('src'),location.href);
  const theme=root.getAttribute('data-su-theme');
  url.searchParams.set('suTheme',theme);
  const next=url.pathname+url.search+url.hash;
  if(iframe.getAttribute('src')!==next)iframe.setAttribute('src',next);
 };
 // Measure intrinsic app content, never the iframe viewport (body has min-height:100vh).
 let contentObserver;
 const fitEmbed=()=>{
  contentObserver?.disconnect();
  try{
   const doc=iframe?.contentDocument,content=doc?.querySelector('main.wrap');
   if(!content)return;
   const resize=()=>{
    const height=Math.ceil(content.getBoundingClientRect().bottom+iframe.contentWindow.scrollY+12);
    if(height>0)iframe.style.setProperty('--su-embed-height',Math.min(12000,Math.max(640,height))+'px');
   };
   contentObserver=new ResizeObserver(resize);contentObserver.observe(content);resize();
  }catch{/* Preserve the original iframe fallback. */}
 };
 iframe?.addEventListener('load',fitEmbed);
 fitEmbed();
 updateEmbed();
 select.addEventListener('change',()=>{
  if(!iframe)return;
  iframe.contentWindow?.postMessage({type:'su:set-embed-theme',theme:root.getAttribute('data-su-theme')},location.origin);
 });
 enableThemeNavigation(document,()=>root.getAttribute('data-su-theme'));
}
