import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('tool mode buttons announce initial pressed state',()=>{const nav=html.match(/<nav class="tabs" aria-label="Tipos de sorteio">([\s\S]*?)<\/nav>/)?.[1];assert.ok(nav);const buttons=[...nav.matchAll(/<button\b([^>]*)>/g)].map(m=>m[1]);assert.equal(buttons.length,4);for(const button of buttons){assert.match(button,/type="button"/);assert.match(button,/aria-pressed="(?:true|false)"/);}assert.equal(buttons.filter(b=>b.includes('aria-pressed="true"')).length,1);assert.match(buttons[0],/data-tab="numbers"/);assert.match(buttons[0],/aria-pressed="true"/);assert.ok(html.includes("b.setAttribute('aria-pressed',String(b.dataset.tab===mode))"));});
