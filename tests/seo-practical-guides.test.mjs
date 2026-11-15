import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const [slug,required] of [['sortear-numeros',['Como conferir se o sorteio está configurado corretamente?','Sorteio com e sem reposição']],['sortear-equipes',['Quantas pessoas ficam em cada equipe?','Lista de conferência antes de dividir os grupos']]])test('useful guide on '+slug,()=>{const html=readFileSync(new URL('../public/'+slug+'/index.html',import.meta.url),'utf8');for(const phrase of required)assert.ok(html.includes(phrase));assert.ok(html.includes('rel="canonical"'));assert.ok(html.includes('id="sorteador-embed"'));assert.ok(html.includes('su-ga4-consent-v1'));});
