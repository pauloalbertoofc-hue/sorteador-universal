import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('secondary tool directory stays accessible without dominating homepage',()=>{assert.match(html,/<details class="tool-directory"><summary>Explorar outras ferramentas de sorteio<\/summary><nav aria-label="Ferramentas para pesquisa"/);assert.ok(html.includes('nav[aria-label="Ferramentas para pesquisa"] a[href]'));for(const slug of ['sortear-nomes','sortear-numeros','sortear-equipes','roleta-online','sorteio-rifa-online','cara-ou-coroa-online','sortear-aluno-online','dividir-turma-em-grupos'])assert.ok(html.includes('href="/'+slug+'/"'));assert.ok(html.includes('su-ga4-consent-v1'));assert.ok(html.includes('id="roomCreate"'));});
