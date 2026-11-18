import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SU_THEMES,SU_DEFAULT_THEME,isSuTheme,setSuTheme,getSuTheme} from '../public/theme-system/themes.mjs';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const routes=['sortear-nomes','sortear-numeros','sortear-equipes','roleta-online','sorteio-rifa-online','cara-ou-coroa-online','sortear-aluno-online','dividir-turma-em-grupos'];

test('seven unique themes with classic default and original option',()=>{
 assert.equal(SU_THEMES.length,7);assert.equal(new Set(SU_THEMES).size,7);
 assert.equal(SU_DEFAULT_THEME,'classic');assert.ok(isSuTheme('original'));assert.equal(isSuTheme('unknown'),false);
 const attrs=new Map();const root={setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k)};
 assert.equal(setSuTheme(root,'ruby'),'ruby');assert.equal(getSuTheme(root),'ruby');
 assert.equal(setSuTheme(root,'not-a-theme'),'classic');
});
test('existing public routes retain canonical, embedded tool and consent',()=>{
 for(const slug of routes){
  const html=read('../public/'+slug+'/index.html');
  assert.match(html,new RegExp('rel="canonical" href="https://sorteador\\.shadownink\\.com/'+slug+'/"'));
  assert.match(html,/<iframe\b/);assert.match(html,/su-ga4-consent-v1/);
  assert.match(html,/mountSuSeoShell/);
 }
});
test('homepage keeps canonical and core app integration',()=>{
 const html=read('../public/index.html');
 assert.match(html,/rel="canonical" href="https:\/\/sorteador\.shadownink\.com\/"/);
 assert.match(html,/theme-system\/home\.mjs/);
 assert.match(html,/roomIdFromUrl/);assert.match(html,/billing/);
});
test('secret santa stays outside redesign and noindex',()=>{
 const html=read('../public/amigo-secreto/index.html');
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.doesNotMatch(html,/theme-system\//);
});
test('sitemap retains current SEO routes',()=>{
 const xml=read('../public/sitemap.xml');
 for(const slug of routes)assert.ok(xml.includes('https://sorteador.shadownink.com/'+slug+'/'));
 assert.doesNotMatch(xml,/amigo-secreto/);
});
