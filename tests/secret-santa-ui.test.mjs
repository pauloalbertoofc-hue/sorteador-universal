import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/amigo-secreto/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/amigo-secreto/app.mjs', import.meta.url), 'utf8');

test('private Secret Santa page is mobile-friendly and not indexed prematurely', () => {
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(html, /id="createForm"/);
  assert.match(html, /id="revealSection"/);
});

test('participant tokens are carried in URL fragments, not query strings', () => {
  assert.match(js, /location\.hash\.slice\(1\)/);
  assert.match(js, /url\.hash = new URLSearchParams/);
  assert.match(js, /\/reveal'?,?\s*\{accessToken\}/);
});

test('private names and recipients are rendered as text, never inserted as HTML', () => {
  assert.match(js, /name\.textContent = item\.name/);
  assert.match(js, /\$\('recipient'\)\.textContent = data\.recipient/);
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write/);
});

test('no ad scripts or placements were added to private invitation page', () => {
  assert.doesNotMatch(html + js, /adsterra|adsbygoogle|atOptions|invoke\.js/i);
});

