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
