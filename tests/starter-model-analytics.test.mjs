import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('starter model event uses allowlisted model and consent gated analytics',()=>{
 assert.ok(html.includes("'starter_selected'].includes(name)"));
 assert.ok(html.includes("['raffle100','classroom','groups','coin'].includes(params.model)"));
 assert.ok(html.includes("'starter_selected',{model:key,tool:model.tool}"));
 assert.ok(html.includes("localStorage.getItem(key)!=='accepted'"));
 assert.ok(html.includes("window.self!==window.top"));
});
