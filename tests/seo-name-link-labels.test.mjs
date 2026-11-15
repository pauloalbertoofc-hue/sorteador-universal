import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const slug of ['sortear-numeros','sortear-equipes'])test('names landing link matches page intent in '+slug,()=>{const html=readFileSync(new URL('../public/'+slug+'/index.html',import.meta.url),'utf8');assert.match(html,/<a href="\/sortear-nomes\/">Sortear nomes online grátis<\/a>/);assert.doesNotMatch(html,/<a href="\/sortear-nomes\/">Roleta de nomes online grátis<\/a>/);assert.match(html,/id="sorteador-embed"/);});
