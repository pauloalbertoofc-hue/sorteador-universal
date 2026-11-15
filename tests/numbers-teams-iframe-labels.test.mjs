import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const [slug, title, model] of [
  ['sortear-numeros', 'Sorteador de números — ferramenta interativa para sortear intervalos', 'numbers'],
  ['sortear-equipes', 'Sorteador de equipes — ferramenta interativa para dividir participantes', 'teams'],
]) {
  test(`${slug}: embedded tool has descriptive accessible name`, () => {
    const html = readFileSync(new URL(`../public/${slug}/index.html`, import.meta.url), 'utf8');
    assert.ok(html.includes(`title="${title}"`));
    assert.ok(html.includes(`src="/?ferramenta=${model}&amp;incorporado=1"`));
    assert.doesNotMatch(html, /title="Sorteador Universal — ferramenta interativa"/);
  });
}
