import {SU_THEMES,SU_DEFAULT_THEME,setSuTheme} from './themes.mjs';
/** Adds shared chrome to an existing SEO landing page without touching its tool iframe. */
export function mountSuSeoShell({root=document.body,main=document.querySelector('main')}={}){
 if(!root||!main)throw new TypeError('A page root and main are required');
 if(main.querySelector('[data-su-nav]'))return;
 root.classList.add('su-integrated');
 setSuTheme(root,SU_DEFAULT_THEME);
 const nav=document.createElement('nav');nav.className='su-nav';nav.dataset.suNav='';nav.setAttribute('aria-label','Navegação do Sorteador Universal');
 const home=document.createElement('a');home.href='/';home.textContent='✦ Sorteador Universal';
 const label=document.createElement('label');label.textContent='Aparência';
 const select=document.createElement('select');select.setAttribute('aria-label','Selecionar aparência');
 const labels={classic:'01 — Clássico',modern:'02 — Moderno',amethyst:'03 — Ametista',ruby:'04 — Rubi',crystal:'05 — Cristal',abyssal:'06 — Abissal',original:'07 — Original'};
 for(const theme of SU_THEMES)select.add(new Option(labels[theme],theme));
 select.value=SU_DEFAULT_THEME;
 select.addEventListener('change',()=>setSuTheme(root,select.value));
 label.appendChild(select);nav.append(home,label);main.prepend(nav);
}
