import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const slug of ['sortear-nomes','sortear-numeros','sortear-equipes','roleta-online','sorteio-rifa-online','cara-ou-coroa-online','sortear-aluno-online','dividir-turma-em-grupos'])test('iframe auto-resizes after content changes: '+slug,()=>{const html=readFileSync(new URL('../public/'+slug+'/index.html',import.meta.url),'utf8');assert.ok(html.includes('new ResizeObserver(resize);observer.observe(doc.documentElement);resize()'));assert.ok(html.includes('id="sorteador-embed"'));assert.ok(html.includes('su-ga4-consent-v1'));});
