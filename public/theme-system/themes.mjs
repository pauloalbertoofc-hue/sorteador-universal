/** Prototype-only theme controller. Do not import into live pages until reviewed. */
// Only approved appearances are selectable in the public release. Other themes remain in source for staged rollout.
export const SU_THEMES=Object.freeze(["classic","original"]);
export const SU_DEFAULT_THEME="classic";
export function isSuTheme(value){return SU_THEMES.includes(value)}
export function setSuTheme(root,theme){if(!root||typeof root.setAttribute!=="function")throw new TypeError("A root element is required");const next=isSuTheme(theme)?theme:SU_DEFAULT_THEME;root.setAttribute("data-su-theme",next);return next}
export function getSuTheme(root){const value=root?.getAttribute?.("data-su-theme");return isSuTheme(value)?value:SU_DEFAULT_THEME}
/** Intentionally no localStorage/sessionStorage/cookies: guest preference is ephemeral. */

/** Theme continuity via an optional URL parameter; no browser storage or draw data. */
export const SU_THEME_QUERY_KEY='suTheme';
export const SU_PUBLIC_ROUTES=Object.freeze(['/', '/sortear-nomes/','/sortear-numeros/','/sortear-equipes/','/roleta-online/','/sorteio-rifa-online/','/cara-ou-coroa-online/','/sortear-aluno-online/','/dividir-turma-em-grupos/']);
export function themeFromUrl(url){const parsed=new URL(url,'https://sorteador.shadownink.com/');const theme=parsed.searchParams.get(SU_THEME_QUERY_KEY);return isSuTheme(theme)?theme:SU_DEFAULT_THEME}
export function themedPublicHref(href,theme,base){
 const parsed=new URL(href,base);
 const origin=new URL(base).origin;
 if(parsed.origin!==origin||!SU_PUBLIC_ROUTES.includes(parsed.pathname)||parsed.searchParams.has('room')||parsed.searchParams.has('incorporado')||parsed.searchParams.has('evento')||parsed.searchParams.has('event'))return null;
 if(isSuTheme(theme)&&theme!==SU_DEFAULT_THEME)parsed.searchParams.set(SU_THEME_QUERY_KEY,theme);
 else parsed.searchParams.delete(SU_THEME_QUERY_KEY);
 return parsed.href;
}
/** Rewrites only eligible same-origin public tool links at navigation time. */
export function enableThemeNavigation(root,getTheme,{baseUrl=()=>location.href}={}){
 if(!root||typeof root.addEventListener!=='function')throw new TypeError('Navigation root is required');
 const onClick=(event)=>{
  const anchor=event.target?.closest?.('a[href]');
  if(!anchor||!root.contains(anchor)||anchor.hasAttribute('download'))return;
  const next=themedPublicHref(anchor.href,getTheme(),baseUrl());
  if(next)anchor.href=next;
 };
 root.addEventListener('click',onClick,true);
 return ()=>root.removeEventListener('click',onClick,true);
}
