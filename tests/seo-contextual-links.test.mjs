import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pairs=[['sortear-numeros','sorteio-rifa-online'],['sortear-equipes','dividir-turma-em-grupos'],['roleta-online','sortear-aluno-online'],['roleta-online','cara-ou-coroa-online']];
for(const [source,target] of pairs)test(source+' links to '+target,()=>{const html=readFileSync(new URL('../public/'+source+'/index.html',import.meta.url),'utf8');assert.ok(html.includes('href="/'+target+'/"'));});
