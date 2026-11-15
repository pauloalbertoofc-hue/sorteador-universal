import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../public/',import.meta.url);
const sitemap=readFileSync(new URL('sitemap.xml',base),'utf8');
for(const [slug,model] of [['sortear-aluno-online','classroom'],['dividir-turma-em-grupos','groups']]){
 test(slug+' exposes canonical metadata, embedded starter and sitemap entry',()=>{
  const html=readFileSync(new URL(slug+'/index.html',base),'utf8');
  const url='https://sorteador.shadownink.com/'+slug+'/';
  assert.ok(html.includes('<link rel="canonical" href="'+url+'">'));
  assert.ok(html.includes('src="/?modelo='+model+'&amp;incorporado=1"'));
  assert.ok(html.includes('G-WLPLRWSBE6'));
  assert.ok(html.includes('su-ga4-consent-v1'));
  assert.ok(sitemap.includes('<loc>'+url+'</loc>'));
  assert.match(html,/<h1>[^<]+<\/h1>/);
  assert.match(html,/name="description"/);
 });
}
