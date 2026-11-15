import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pages = [
  ['roleta-online', 'Roleta de nomes — ferramenta interativa para girar e sortear'],
  ['sortear-nomes', 'Sorteador de nomes — ferramenta interativa para selecionar participantes'],
];
for (const [slug, label] of pages) {
  test(`${slug}: iframe explains the specific tool to assistive technology`, () => {
    const html = readFileSync(new URL(`../public/${slug}/index.html`, import.meta.url), 'utf8');
    assert.ok(html.includes(`title="${label}"`));
    assert.match(html, /id="sorteador-embed"/);
    assert.match(html, /src="\/\?ferramenta=names&amp;incorporado=1"/);
  });
}
