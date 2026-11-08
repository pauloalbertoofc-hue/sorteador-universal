import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const htmlUrl = new URL('../public/index.html', import.meta.url);

test('free tools browser smoke tests', async t => {
  const server = createServer(async (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(await readFile(htmlUrl));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.route(/^https?:\/\//, route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await t.test('mobile quick presets switch tools and draw', async () => {
      await page.locator('[data-quick=number100]').click();
      assert.equal(await page.locator('[data-tab=numbers]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#result .chip').count(), 1);
      await page.locator('[data-quick=coin]').click();
      assert.equal(await page.locator('[data-tab=names]').getAttribute('aria-pressed'), 'true');
      const coin = (await page.locator('#result .chip').first().textContent()).trim();
      assert.ok(['Cara', 'Coroa'].includes(coin));
      await page.locator('[data-quick=dice6]').click();
      assert.equal(await page.locator('#sides').inputValue(), '6');
      assert.equal(await page.locator('#result .chip').count(), 1);
      await page.locator('[data-quick=teams2]').click();
      assert.equal(await page.locator('#teamcount').inputValue(), '2');
    });
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
    await t.test('teams: group by maximum participants', async () => {
      await page.locator('[data-tab=teams]').click();
      await page.locator('#players').fill('Ana\\nBruno\\nCarla\\nDiego\\nEva');
      await page.locator('#teamMode').selectOption('size');
      await page.locator('#teamSize').fill('2');
      assert.equal(await page.locator('#teamSizeField').isVisible(), true);
      await page.locator('#draw').click();
      assert.equal(await page.locator('#result .team').count(), 3);
      const sizes = await page.locator('#result .team').evaluateAll(cards => cards.map(card => card.querySelectorAll('span').length));
      assert.deepEqual(sizes.slice().sort((a,b)=>a-b), [1,2,2]);
      await page.locator('#teamMode').selectOption('count');
      assert.equal(await page.locator('#teamSizeField').isVisible(), false);
    });
    await t.test('teams: share button appears only after a valid team draw', async () => {
      await page.locator('[data-tab=numbers]').click();
      assert.equal(await page.locator('#shareTeams').isVisible(), false);
      await page.locator('[data-tab=teams]').click();
      await page.locator('#players').fill('Ana\\nBruno\\nCarla\\nDiego');
      await page.locator('#teamMode').selectOption('count');
      await page.locator('#teamcount').fill('2');
      await page.locator('#draw').click();
      assert.equal(await page.locator('#shareTeams').isVisible(), true);
      await page.locator('[data-tab=dice]').click();
      assert.equal(await page.locator('#shareTeams').isVisible(), false);
    });
    await t.test('dice: valid roll and statistics', async () => {
      await page.locator('[data-tab=dice]').click();
      await page.locator('#dicecount').fill('6');
      await page.locator('#draw').click();
      assert.equal(await page.locator('#result .chip').count(), 6);
      assert.match(await page.locator('#result').textContent(), /Média:/);
      assert.match(await page.locator('#result').textContent(), /Mais frequente/);
    });
    await t.test('numbers: invalid ranges and insufficient unique values', async () => {
      await page.locator('[data-tab=numbers]').click();
      await page.locator('#min').fill('10');
      await page.locator('#max').fill('5');
      await page.locator('#draw').click();
      assert.match(await page.locator('#error').textContent(), /máximo/);
      await page.locator('#max').fill('11');
      await page.locator('#qty').fill('3');
      await page.locator('#draw').click();
      assert.match(await page.locator('#error').textContent(), /Quantidade maior que o intervalo/);
      await page.locator('#qty').fill('2');
      await page.locator('#draw').click();
      assert.equal(await page.locator('#result .chip').count(), 2);
    });
    await t.test('wheel: selects a single valid name', async () => {
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\nBruno\nCarla');
      await page.locator('#excludeWinners').uncheck();
      await page.locator('#winners').fill('1');
      await page.locator('#spin').click();
      await page.waitForFunction(() => !document.querySelector('#spin').disabled, null, { timeout: 8000 });
      const result = (await page.locator('#result').textContent()).trim();
      assert.equal(await page.locator('#wheelWinner').isVisible(), true);
      const winner = (await page.locator('#wheelWinnerName').textContent()).trim();
      assert.ok(['Ana', 'Bruno', 'Carla'].includes(winner));
      assert.ok(result.includes(winner));
      assert.ok(['Ana', 'Bruno', 'Carla'].some(name => result.includes(name)));
      assert.equal(await page.locator('#error').textContent(), '');
    });
    await t.test('names: duplicate entries do not repeat when exclusion is enabled', async () => {
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\\nAna\\nBruno');
      await page.locator('#removeDup').uncheck();
      await page.locator('#excludeWinners').check();
      await page.locator('#winners').fill('2');
      assert.match(await page.locator('#winnerProgress').textContent(), /2 de 2 nomes disponíveis/);
      await page.locator('#draw').click();
      const winners = await page.locator('#result .chip').allTextContents();
      assert.equal(winners.length, 2);
      assert.equal(new Set(winners).size, 2);
      assert.match(await page.locator('#winnerProgress').textContent(), /0 de 2 nomes disponíveis/);
    });
    await t.test('mobile: results stay within the viewport', async () => {
      await page.locator('[data-tab=numbers]').click();
      await page.locator('#min').fill('1');
      await page.locator('#max').fill('1000');
      await page.locator('#qty').fill('1000');
      await page.locator('#draw').click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, 'horizontal page overflow at mobile width');
    });
    await t.test('wheel: excludes winners and refreshes available segments', async () => {
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\\nBruno\\nCarla');
      await page.locator('#winners').fill('1');
      await page.locator('#excludeWinners').check();
      await page.locator('#spin').click();
      await page.waitForFunction(() => !document.querySelector('#spin').disabled, null, { timeout: 8000 });
      assert.equal(await page.locator('#wheelWinner').isVisible(), true);
      assert.match(await page.locator('#winnerProgress').textContent(), /2 de 3 nomes disponíveis/);
      assert.equal(await page.locator('#wheelDisc .wheel-label').count(), 2);
      await page.locator('#spin').click();
      await page.waitForFunction(() => !document.querySelector('#spin').disabled, null, { timeout: 8000 });
      assert.match(await page.locator('#winnerProgress').textContent(), /1 de 3 nomes disponíveis/);
      assert.equal(await page.locator('#wheelDisc .wheel-label').count(), 1);
      await page.locator('#resetWinners').click();
      assert.match(await page.locator('#winnerProgress').textContent(), /3 de 3 nomes disponíveis/);
      assert.equal(await page.locator('#wheelDisc .wheel-label').count(), 3);
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
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
