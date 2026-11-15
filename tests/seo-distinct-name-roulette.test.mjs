import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(slug)=>readFileSync(new URL('../public/'+slug+'/index.html',import.meta.url),'utf8');
test('name drawing and roulette have distinct SEO identities',()=>{const names=read('sortear-nomes'),roulette=read('roleta-online');assert.match(names,/<title>Sortear nomes online grátis \| Sorteador Universal<\/title>/);assert.match(names,/<h1>Sortear nomes online grátis<\/h1>/);assert.match(roulette,/<title>Roleta online de nomes grátis \| Sorteador Universal<\/title>/);assert.match(roulette,/<h1>Roleta online de nomes grátis<\/h1>/);assert.match(names,/canonical" href="https:\/\/sorteador\.shadownink\.com\/sortear-nomes\//);assert.match(names,/id="sorteador-embed"/);assert.match(names,/su-ga4-consent-v1/);});
