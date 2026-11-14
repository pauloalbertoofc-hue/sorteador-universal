import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pages=['index.html','sortear-nomes/index.html','sortear-numeros/index.html','sortear-equipes/index.html','roleta-online/index.html'];
for(const page of pages){test('GA4 requires explicit opt-in: '+page,()=>{const html=readFileSync(new URL('../public/'+page,import.meta.url),'utf8');assert.match(html,/G-KR8M63FG0S/);assert.match(html,/window.self!==window.top/);assert.match(html,/if\(choice==='accepted'\)start\(\)/);assert.match(html,/\['Aceitar análise','accepted'\]/);assert.match(html,/\['Recusar análise','rejected'\]/);assert.match(html,/suAnalyticsPreferences/);assert.match(html,/googletagmanager.com\/gtag\/js\?id=/);assert.ok(html.indexOf('script.src=')>html.indexOf('function start()'));});}
test('privacy text explains opt-in analytics',()=>{const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.match(html,/Google Analytics \(opcional\)/);assert.match(html,/só é carregada depois que você aceita/);});
