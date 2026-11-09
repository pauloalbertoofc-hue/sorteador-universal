import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('four free tools remain available', () => {
  for (const name of ['numbers', 'names', 'teams', 'dice']) {
    assert.match(html, new RegExp('data-tab="' + name + '"'));
    assert.match(html, new RegExp(name + ':\\x60'));
  }
});

test('form preferences can be restored and erased locally', () => {
  assert.match(html, /su-tool-settings-v1/);
  assert.match(html, /function persistFields\(/);
  assert.match(html, /function restoreFields\(/);
  assert.match(html, /id="clearSettings"/);
  assert.match(html, /localStorage\.removeItem\(fieldSettingsKey\)/);
});

test('results are announced accessibly and can be copied', () => {
  assert.match(html, /id="result"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /history-copy/);
  assert.match(html, /navigator\.clipboard\.writeText\(x\.text\)/);
});

test('service worker never caches API account requests', () => {
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /fetch\(req, \{cache: 'no-store'\}\)/);
});


test('unique number sampling terminates and returns every number in a full draw', () => {
  const match = html.match(/let values=\[\];if\(unique\)\{const swapped=new Map\(\);[\s\S]*?\}if\(\$\('#sortAscending'\)/);
  assert.ok(match, 'sampling code should remain present');
  const body = match[0].slice(0, match[0].lastIndexOf("if($('#sortAscending')"));
  const sample = new Function('min', 'range', 'qty', 'unique', 'randomInt', body + ';return values;');
  const lowest = max => 0;
  const highest = max => max - 1;
  for (const rng of [lowest, highest]) {
    const values = sample(-10, 1000, 1000, true, rng);
    assert.equal(values.length, 1000);
    assert.equal(new Set(values).size, 1000);
    assert.equal(Math.min(...values), -10);
    assert.equal(Math.max(...values), 989);
  }
  assert.deepEqual(sample(5, 1, 4, false, lowest), [5, 5, 5, 5]);
});


test('large name and number results render in manageable batches', () => {
  assert.match(html, /function renderChips\(display,values\)/);
  assert.match(html, /const limit=60/);
  assert.match(html, /document\.createDocumentFragment\(\)/);
  assert.match(html, /more\.addEventListener\('click',addNext\)/);
  assert.match(html, /renderChips\(display,values\)/);
});

test('remaining winner counter uses distinct names even when duplicates are allowed', () => {
  assert.match(html, /let distinct=\[\.\.\.new Set\(a\)\]/);
  assert.match(html, /distinct\.filter\(n=>!excludedWinners\.has\(n\)\)\.length/);
  assert.match(html, /distinct\.length\} nomes disponíveis nesta sessão/);
});

test('history stores favorites and reusable settings locally', () => {
  assert.match(html, /function historyFields\(/);
  assert.match(html, /function pushHistory\(/);
  assert.match(html, /x\.favorite=!x\.favorite;normalizeHistory\(\);save\(\)/);
  assert.match(html, /mode,fields:historyFields\(\),favorite:false/);
  assert.match(html, /localStorage\.setItem\('su-history'/);
});

test('wheel permits the final remaining name in elimination mode', () => {
  assert.match(html, /a\.length===1&&!\$\('#excludeWinners'\)\.checked/);
  assert.match(html, /if\(!a\.length\|\|a\.length>24\)/);
});

test('saved participant collections are local and bounded', () => {
  assert.match(html, /su-free-collections-v1/);
  assert.match(html, /id="collectionName"/);
  assert.match(html, /id="saveCollection"/);
  assert.match(html, /collections\.length>=10/);
  assert.match(html, /localStorage\.setItem\(collectionKey,JSON\.stringify\(collections\)\)/);
});

test('result cards are generated locally and shared with a fallback download', () => {
  assert.match(html, /function createResultCard\(/);
  assert.match(html, /canvas\.width=1080;canvas\.height=1080/);
  assert.match(html, /canvas\.toBlob\(resolve,'image\/png'\)/);
  assert.match(html, /navigator\.canShare/);
  assert.match(html, /link\.download='sorteador-resultado\.png'/);
});

test('cancelled wheel spins invalidate scheduled animation frames', () => {
  assert.match(html, /if\(token===spinToken&&spinning&&mode==='names'\)/);
  assert.match(html, /if\(token!==spinToken\|\|mode!=='names'\)return/);
});

test('v2.3 design system keeps mobile navigation bounded', () => {
  assert.match(html, /id="free-tools-design-v23"/);
  assert.match(html, /\.tabs\{top:auto!important;bottom:0!important;height:auto!important/);
  assert.match(html, /max-height:110px/);
  assert.match(html, /Versão 2\.[56]/);
});

test('v2.5 public rooms have accessible create, join, copy and draw controls', () => {
  for(const id of ['roomStudio','roomCreate','roomTitle','roomLimit','roomActive','roomJoin','roomCopy','roomClose','roomUse','roomEntries','roomMessage'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/searchParams\.set\('room',id\)/);
  assert.match(html,/localStorage\.setItem\('su-room-admin-'/);
  assert.match(html,/const field=\$\('#items'\)/);
});

test('v2.5 public rooms provide bounded entry and explicit privacy messaging', () => {
  assert.match(html, /max="100"/);
  assert.match(html, /Inscrições abertas por até 24 horas/);
  assert.match(html, /credentials:'omit'/);
  assert.match(html, /roomAdminToken=localStorage\.getItem/);
  assert.match(html, /Não inclua dados sensíveis/);
});
