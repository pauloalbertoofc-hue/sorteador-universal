import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('homepage describes free draw tools in title and visible introduction',()=>{assert.match(html,/<title>Sorteador Online Grátis: Nomes, Números e Roleta \| Sorteador Universal<\/title>/);assert.match(html,/<header><h1>Deixe o acaso decidir\.<\/h1><p>Use o Sorteador Universal para fazer sorteios online grátis/);assert.match(html,/rel="canonical" href="https:\/\/sorteador\.shadownink\.com\/"/);});
test('privacy ad disclosure does not claim removed ad-hiding feature',()=>{const section=html.split('<h3>Publicidade e cookies</h3>')[1]?.split('<h3>Contato e responsável</h3>')[0];assert.ok(section);assert.doesNotMatch(section,/ocult(a|á|á-los)|preferência de ocultação/i);assert.match(section,/Adsterra/);assert.match(html,/id="adBannerSmall"/);assert.match(html,/id="adBannerLarge"/);});
