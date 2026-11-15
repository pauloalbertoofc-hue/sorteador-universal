import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('mobile-first homepage prioritizes drawing over installation',()=>{const quick=html.indexOf('aria-label="Sorteios rápidos"');const models=html.indexOf('class="shareable-models"');const install=html.indexOf('id="instalacao"');const rooms=html.indexOf('id="roomStudio"');assert.ok(quick>0&&models>quick&&install>models&&rooms>install);assert.equal((html.match(/id="installApp"/g)||[]).length,1);assert.equal((html.match(/id="installHelp"/g)||[]).length,1);assert.ok(html.includes('id="shareStarterLink"'));assert.ok(html.includes('su-ga4-consent-v1'));});
