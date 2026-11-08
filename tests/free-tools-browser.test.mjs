import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const pageUrl = new URL('../public/index.html', import.meta.url).href;

test('free tools browser smoke tests', async t => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.route(/^https?:\/\//, route => route.abort());
    await page.goto(pageUrl);
    await t.test('numbers: full unique range and incremental results', async () => {
      await page.locator('#min').fill('1');
      await page.locator('#max').fill('100');
      await page.locator('#qty').fill('100');
      await page.locator('#draw').click();
      assert.equal(await page.locator('#result .chip').count(), 60);
      await page.locator('.show-more').click();
      const nums = (await page.locator('#result .chip').allTextContents()).map(Number);
      assert.equal(nums.length, 100);
      assert.equal(new Set(nums).size, 100);
    });
    await t.test('names: winners do not repeat across rounds', async () => {
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\nBruno\nCarla');
      await page.locator('#excludeWinners').check();
      const seen = new Set();
      for (let i=0; i<3; i++) {
        await page.locator('#draw').click();
        const winner = (await page.locator('#result .chip').first().textContent()).trim();
        assert.ok(!seen.has(winner));
        seen.add(winner);
      }
      await page.locator('#draw').click();
      assert.match(await page.locator('#error').textContent(), /Reinicie os vencedores/);
      await page.locator('#resetWinners').click();
      await page.locator('#draw').click();
      assert.equal(await page.locator('#result .chip').count(), 1);
    });
    await t.test('teams: balanced groups and custom labels', async () => {
      await page.locator('[data-tab=teams]').click();
      await page.locator('#players').fill('Ana\nBruno\nCarla\nDavi\nEva');
      await page.locator('#teamcount').fill('2');
      await page.locator('#teamnames').fill('Azul\nVerde');
      await page.locator('#draw').click();
      const counts = await page.locator('#result .team').evaluateAll(cards => cards.map(card => card.querySelectorAll('span').length));
      assert.deepEqual(counts.sort(), [2,3]);
      assert.match(await page.locator('#result').textContent(), /Azul/);
    });
    await t.test('dice: valid roll and statistics', async () => {
      await page.locator('[data-tab=dice]').click();
      await page.locator('#dicecount').fill('6');
      await page.locator('#draw').click();
      assert.equal(await page.locator('#result .chip').count(), 6);
      assert.match(await page.locator('#result').textContent(), /Média:/);
      assert.match(await page.locator('#result').textContent(), /Mais frequente/);
    });
    await t.test('saved settings can be cleared', async () => {
      await page.locator('[data-tab=numbers]').click();
      await page.locator('#max').fill('777');
      await page.locator('[data-tab=dice]').click();
      await page.locator('[data-tab=numbers]').click();
      assert.equal(await page.locator('#max').inputValue(), '777');
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#clearSettings').click();
      assert.equal(await page.locator('#max').inputValue(), '100');
    });
    await context.close();
  } finally { await browser.close(); }
});
