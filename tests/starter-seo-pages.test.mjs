import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../public/',import.meta.url);
const sitemap=readFileSync(new URL('sitemap.xml',root),'utf8');
for(const [slug,model] of [['sorteio-rifa-online','raffle100'],['cara-ou-coroa-online','coin']]){
 test(slug+' has unique canonical, metadata, and privacy-safe model iframe',()=>{
  const html=readFileSync(new URL(slug+'/index.html',root),'utf8');
  const canonical='https://sorteador.shadownink.com/'+slug+'/';
  assert.ok(html.includes('<link rel="canonical" href="'+canonical+'">'));
  assert.ok(html.includes('src="/?modelo='+model+'&amp;incorporado=1"'));
  assert.ok(html.includes('G-WLPLRWSBE6'));
  assert.ok(html.includes('su-ga4-consent-v1'));
  assert.ok(sitemap.includes('<loc>'+canonical+'</loc>'));
  assert.match(html,/<h1>[^<]+<\/h1>/);
  assert.match(html,/name="description"/);
 });
}
