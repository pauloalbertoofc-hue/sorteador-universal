import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('landing click event stays on consent-gated allowlisted GA4 path',()=>{
 assert.ok(html.includes("'landing_opened'].includes(name)"));
 assert.ok(html.includes("name==='landing_opened'"));
 assert.ok(html.includes("['sortear-nomes','sortear-numeros','sortear-equipes','roleta-online','sorteio-rifa-online','cara-ou-coroa-online','sortear-aluno-online','dividir-turma-em-grupos'].includes(params.page)"));
 assert.ok(html.includes("localStorage.getItem(key)!=='accepted'"));
 assert.ok(html.includes("window.self!==window.top"));
 assert.ok(html.includes("'landing_opened',{page}"));
 assert.ok(html.includes('nav[aria-label="Ferramentas para pesquisa"] a[href]'));
});
