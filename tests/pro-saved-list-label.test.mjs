import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('Pro saved-list selector has a persistent accessible label',()=>{assert.match(html,/<label for="presetSelect">Lista salva<\/label>\s*<select id="presetSelect">/);assert.match(html,/<option value="">Selecione uma lista<\/option>/);assert.match(html,/id="proStudio" hidden/);});
