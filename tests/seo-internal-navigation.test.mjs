import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../public/',import.meta.url);
const home=readFileSync(new URL('index.html',root),'utf8');
const sitemap=readFileSync(new URL('sitemap.xml',root),'utf8');
const slugs=['sortear-nomes','sortear-numeros','sortear-equipes','roleta-online','sorteio-rifa-online','cara-ou-coroa-online','sortear-aluno-online','dividir-turma-em-grupos'];
test('all sitemap landing pages are discoverable from the homepage',()=>{
 for(const slug of slugs){
  assert.ok(home.includes('href="/'+slug+'/"'),'missing homepage link '+slug);
  assert.ok(sitemap.includes('https://sorteador.shadownink.com/'+slug+'/'),'missing sitemap '+slug);
 }
});
