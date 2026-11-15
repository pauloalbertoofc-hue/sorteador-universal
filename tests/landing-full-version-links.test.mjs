import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const slug of ['sortear-nomes','sortear-numeros','sortear-equipes','roleta-online'])test('full version opens in a new tab: '+slug,()=>{const html=readFileSync(new URL('../public/'+slug+'/index.html',import.meta.url),'utf8');assert.match(html,/<a href="\/\?ferramenta=[^"]+" target="_blank" rel="noopener noreferrer">Abrir versão completa em uma nova página<\/a>/);assert.ok(html.includes('id="sorteador-embed"'));});
