import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../public/', import.meta.url);
const origin = 'https://sorteador.shadownink.com';
const paths = [
  '/', '/sortear-nomes/', '/sortear-numeros/', '/sortear-equipes/',
  '/roleta-online/', '/sorteio-rifa-online/', '/cara-ou-coroa-online/',
  '/sortear-aluno-online/', '/dividir-turma-em-grupos/',
];

test('sitemap includes each published landing URL exactly once', () => {
  const sitemap = readFileSync(new URL('sitemap.xml', root), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(locations.length, paths.length);
  assert.deepEqual(new Set(locations), new Set(paths.map(path => origin + path)));
});

test('each sitemap page has a matching canonical URL and indexable metadata', () => {
  for (const path of paths) {
    const html = readFileSync(new URL(path === '/' ? 'index.html' : path.slice(1) + 'index.html', root), 'utf8');
    assert.ok(html.includes(`href="${origin + path}"`), `canonical missing: ${path}`);
    assert.doesNotMatch(html, /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i, `noindex directive: ${path}`);
    if (path !== '/') assert.match(html, /<meta name="robots" content="index,follow"/, `robots meta missing: ${path}`);
  }
});

test('robots.txt points to the canonical sitemap', () => {
  const robots = readFileSync(new URL('robots.txt', root), 'utf8');
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
});
