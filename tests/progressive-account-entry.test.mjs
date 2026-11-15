import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('account entry is optional and links to existing account area',()=>{
 assert.match(html, /class="account-entry" href="#conta"/);
 assert.match(html, /id="conta"/);
 assert.match(html, /id="accountLogin"/);
 assert.match(html, /id="accountRegister"/);
 assert.match(html, /id="accountLogout"/);
 assert.match(html, /Sem cadastro, sem complicação/);
});
