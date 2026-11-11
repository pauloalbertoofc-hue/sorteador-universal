import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cases=[['sortear-nomes','names'],['sortear-numeros','numbers'],['sortear-equipes','teams'],['roleta-online','names']];
for(const [slug,mode] of cases){test('SEO landing page embeds working app: '+slug,()=>{const html=readFileSync(new URL('../public/'+slug+'/index.html',import.meta.url),'utf8');assert.match(html,new RegExp('<iframe[^>]+src="/\\?ferramenta='+mode+'&amp;incorporado=1"'));assert.match(html,/id="sorteador-embed"/);assert.match(html,/ResizeObserver/);assert.match(html,/rel="canonical"/);assert.match(html,/Abrir versão completa/);assert.doesNotMatch(html,/class="cta" href="https:\/\/sorteador\.shadownink\.com\/\?ferramenta=/)})}
test('existing app supports selected tool query and preserves room features',()=>{const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.match(html,/requestedTool=new URLSearchParams\(location.search\).get\('ferramenta'\)/);assert.match(html,/switchTab\(mode\)/);assert.match(html,/id="roomDraw"/);assert.match(html,/id="roomWheel"/)})
