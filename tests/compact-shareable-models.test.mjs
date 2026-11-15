import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('shareable models remain functional inside compact disclosure',()=>{assert.match(html,/<details class="shareable-models"><summary>Modelos prontos para compartilhar<\/summary><section class="quick-start"/);assert.match(html, /id="shareStarterLink" hidden>Compartilhar link do modelo<\/button><\/section><\/details>/);for(const key of ['raffle100','classroom','groups','coin'])assert.ok(html.includes('data-starter="'+key+'"'));assert.ok(html.includes('id="roomStudio"'));assert.ok(html.includes('su-ga4-consent-v1'));});
