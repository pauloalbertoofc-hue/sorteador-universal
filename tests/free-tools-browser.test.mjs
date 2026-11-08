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
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route(/^https?:\/\//, route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await t.test('mobile v2.2: bottom navigation and touch targets', async () => {
      const nav = page.locator('.tabs');
      const metrics = await nav.evaluate(node => {
        const box = node.getBoundingClientRect();
        return {
          position: getComputedStyle(node).position,
          bottom: Math.abs(window.innerHeight - box.bottom),
          columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
          width: box.width,
          height: box.height,
          top: getComputedStyle(node).top
        };
      });
      assert.equal(metrics.position, 'fixed');
      assert.ok(metrics.bottom <= 2, 'bottom navigation should touch viewport bottom');
      assert.equal(metrics.columns, 4);
      assert.ok(metrics.width <= 391);
      assert.ok(metrics.height >= 54 && metrics.height <= 110, `mobile navigation must stay compact, got ${metrics.height}px`);
      assert.notEqual(metrics.top, '0px', 'bottom navigation must not inherit sticky top: 0');
      for (const tab of ['numbers', 'names', 'teams', 'dice']) {
        const button = page.locator(`[data-tab=${tab}]`);
        const height = await button.evaluate(node => node.getBoundingClientRect().height);
        assert.ok(height >= 48, `${tab} needs a touch-friendly navigation target`);
        await button.click();
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
      }
      await page.locator('[data-tab=numbers]').click();
      const drawHeight = await page.locator('#draw').evaluate(node => node.getBoundingClientRect().height);
      assert.ok(drawHeight >= 50, 'draw action needs a touch-friendly target');
    });
    await t.test('mobile: 320px and 390px navigation remains usable', async () => {
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 720 });
        for (const tool of ['numbers', 'names', 'teams', 'dice']) {
          const button = page.locator(`[data-tab=${tool}]`);
          await button.click();
          assert.equal(await button.getAttribute('aria-pressed'), 'true');
          const metrics = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            viewport: document.documentElement.clientWidth,
            navWidth: document.querySelector('.tabs').getBoundingClientRect().width
          }));
          assert.ok(metrics.scrollWidth <= metrics.viewport + 1, `${tool} overflows at ${width}px`);
          assert.ok(metrics.navWidth <= metrics.viewport + 1);
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('[data-tab=numbers]').click();
    });
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
      await page.locator('[data-tab=numbers]').click();
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
      await page.locator('#players').fill('Ana\nBruno\nCarla\nDiego\nEva');
      await page.locator('#teamMode').selectOption('size');
      await page.locator('#teamSize').fill('2');
      assert.equal(await page.locator('#teamSizeField').isVisible(), true);
      assert.equal(await page.locator('#teamcount').isVisible(), false);
      await page.locator('#draw').click();
      assert.equal(await page.locator('#result .team').count(), 3);
      const sizes = await page.locator('#result .team').evaluateAll(cards => cards.map(card => card.querySelectorAll('span').length));
      assert.deepEqual(sizes.slice().sort((a,b)=>a-b), [1,2,2]);
      await page.locator('#teamMode').selectOption('count');
      assert.equal(await page.locator('#teamSizeField').isVisible(), false);
      assert.equal(await page.locator('#teamcount').isVisible(), true);
    });
    await t.test('teams: share button appears only after a valid team draw', async () => {
      await page.locator('[data-tab=numbers]').click();
      assert.equal(await page.locator('#shareTeams').isVisible(), false);
      await page.locator('[data-tab=teams]').click();
      await page.locator('#players').fill('Ana\nBruno\nCarla\nDiego');
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
    await t.test('wheel v2.2: speed selector and repeat button', async () => {
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\nBruno\nCarla');
      await page.locator('#excludeWinners').uncheck();
      await page.locator('#winners').fill('1');
      assert.equal(await page.locator('#wheelSpeed option').count(), 3);
      await page.locator('#wheelSpeed').selectOption('2000');
      await page.locator('#spin').click();
      assert.equal(await page.locator('#spin').textContent(), 'Girando…');
      await page.waitForFunction(() => !document.querySelector('#spin').disabled, null, { timeout: 8000 });
      assert.match(await page.locator('#spin').textContent(), /Girar novamente/);
      assert.equal(await page.locator('#wheelWinner').isVisible(), true);
    });
    await t.test('wheel v2.2: selected speed controls animation duration', async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      try {
        await page.locator('[data-tab=names]').click();
        await page.locator('#items').fill('Ana\nBruno\nCarla');
        await page.locator('#excludeWinners').uncheck();
        await page.locator('#winners').fill('1');
        await page.locator('#wheelSpeed').selectOption('2000');
        await page.locator('#spin').click();
        const duration = await page.locator('#wheelDisc').evaluate(node => node.style.transition);
        assert.match(duration, /2000ms/);
        await page.locator('#items').fill('Ana\nBruno\nCarla\nDavi');
        assert.equal(await page.locator('#spin').isDisabled(), false);
      } finally {
        await page.emulateMedia({ reducedMotion: 'reduce' });
      }
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
      await page.locator('#items').fill('Ana\nAna\nBruno');
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
    await t.test('mobile: every free tool stays within the viewport', async () => {
      for (const tab of ['numbers', 'names', 'teams', 'dice']) {
        await page.locator(`[data-tab=${tab}]`).click();
        const widths = await page.evaluate(() => ({
          document: document.documentElement.scrollWidth,
          viewport: window.innerWidth
        }));
        assert.ok(widths.document <= widths.viewport + 1,
          `${tab} overflows mobile viewport: ${widths.document}px > ${widths.viewport}px`);
      }
    });
    await t.test('wheel: excludes winners and refreshes available segments', async () => {
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\nBruno\nCarla');
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
      await page.locator('#spin').click();
      await page.waitForFunction(() => !document.querySelector('#spin').disabled, null, { timeout: 8000 });
      assert.match(await page.locator('#winnerProgress').textContent(), /0 de 3 nomes disponíveis/);
      assert.equal(await page.locator('#wheelDisc .wheel-label').count(), 0);
      await page.locator('#resetWinners').click();
      assert.match(await page.locator('#winnerProgress').textContent(), /3 de 3 nomes disponíveis/);
      assert.equal(await page.locator('#wheelDisc .wheel-label').count(), 3);
    });
    await t.test('wheel: changing participants cancels an in-flight spin', async () => {
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\nBruno\nCarla');
      await page.locator('#excludeWinners').check();
      await page.locator('#winners').fill('1');
      const before = await page.locator('#history li').count();
      await page.locator('#spin').click();
      assert.equal(await page.locator('#spin').isDisabled(), true);
      await page.locator('#items').fill('Ana\nBruno\nCarla\nDavi');
      assert.equal(await page.locator('#spin').isDisabled(), false);
      assert.equal(await page.locator('#wheelWinner').isVisible(), false);
      assert.match(await page.locator('#winnerProgress').textContent(), /4 de 4 nomes disponíveis/);
      await page.waitForTimeout(150);
      assert.equal(await page.locator('#history li').count(), before);
    });
    await t.test('wheel: cancellation prevents stale animation and winner', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\nBruno\nCarla');
      await page.locator('#excludeWinners').uncheck();
      await page.locator('#winners').fill('1');
      const historyBefore = await page.locator('#history li').count();
      await page.locator('#spin').click();
      await page.locator('#items').fill('Ana\nBruno\nCarla\nDavi');
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#wheelDisc').evaluate(node => node.style.transform), 'rotate(0deg)');
      assert.equal(await page.locator('#wheelWinner').isVisible(), false);
      assert.equal(await page.locator('#history li').count(), historyBefore);
      assert.match(await page.locator('#wheelNote').textContent(), /4 opções|Opções alteradas/);
    });
    await t.test('wheel: editing participant list resets excluded winners', async () => {
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\nBruno\nCarla');
      await page.locator('#winners').fill('1');
      await page.locator('#excludeWinners').check();
      await page.locator('#draw').click();
      assert.match(await page.locator('#winnerProgress').textContent(), /2 de 3 nomes disponíveis/);
      await page.locator('#items').fill('Ana\nBruno\nCarla\nDiego');
      assert.match(await page.locator('#winnerProgress').textContent(), /4 de 4 nomes disponíveis/);
      assert.equal(await page.locator('#wheelDisc .wheel-label').count(), 4);
    });
    await t.test('result cards: generate a PNG and hide when switching tools', async () => {
      await page.locator('[data-tab=numbers]').click();
      await page.locator('#min').fill('7');
      await page.locator('#max').fill('7');
      await page.locator('#qty').fill('1');
      await page.locator('#draw').click();
      assert.equal(await page.locator('#shareCard').isVisible(), true);
      const dimensions = await page.evaluate(() => {
        const canvas = createResultCard();
        return { width: canvas.width, height: canvas.height, pixels: Array.from(canvas.getContext('2d').getImageData(0, 0, 1, 1).data) };
      });
      assert.equal(dimensions.width, 1080);
      assert.equal(dimensions.height, 1080);
      assert.equal(dimensions.pixels[3], 255);
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await page.locator('#shareCard').click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'sorteador-resultado.png');
      await page.locator('[data-tab=dice]').click();
      assert.equal(await page.locator('#shareCard').isVisible(), false);
    });
    await t.test('collections: save, reload and delete a names list', async () => {
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\nBruno\nCarla');
      await page.locator('#collectionName').fill('Turma de Direito');
      await page.locator('#saveCollection').click();
      assert.equal(await page.locator('#collectionList li').count(), 1);
      await page.reload();
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Outra pessoa');
      await page.getByRole('button', { name: 'Carregar coleção Turma de Direito' }).click();
      assert.equal(await page.locator('#items').inputValue(), 'Ana\nBruno\nCarla');
      await page.getByRole('button', { name: 'Excluir coleção Turma de Direito' }).click();
      assert.match(await page.locator('#collectionList').textContent(), /Nenhuma coleção/);
    });
    await t.test('collections: names and teams remain separate', async () => {
      await page.locator('[data-tab=teams]').click();
      await page.locator('#players').fill('Davi\nEva');
      await page.locator('#collectionName').fill('Equipe de teste');
      await page.locator('#saveCollection').click();
      assert.equal(await page.locator('#collectionList li').count(), 1);
      await page.locator('[data-tab=names]').click();
      assert.match(await page.locator('#collectionList').textContent(), /Nenhuma coleção/);
      await page.locator('[data-tab=teams]').click();
      await page.getByRole('button', { name: 'Excluir coleção Equipe de teste' }).click();
    });
    await t.test('history: favorites and repeat restore draw configuration', async () => {
      await page.locator('[data-tab=numbers]').click();
      await page.locator('#min').fill('25');
      await page.locator('#max').fill('25');
      await page.locator('#qty').fill('1');
      await page.locator('#draw').click();
      const item = page.locator('#history li').first();
      await item.getByRole('button', { name: 'Adicionar aos favoritos' }).click();
      assert.equal(await page.locator('#history li').first().getByRole('button', { name: 'Remover dos favoritos' }).count(), 1);
      await page.locator('#min').fill('1');
      await page.locator('#max').fill('100');
      await page.locator('#history li').first().getByRole('button', { name: /Repetir configuração/ }).click();
      assert.equal(await page.locator('#min').inputValue(), '25');
      assert.equal(await page.locator('#max').inputValue(), '25');
      assert.equal((await page.locator('#result .chip').first().textContent()).trim(), '25');
      await page.reload();
      assert.equal(await page.locator('#history li').filter({ has: page.getByRole('button', { name: 'Remover dos favoritos' }) }).count(), 1);
      assert.equal(await page.locator('#history li').filter({ has: page.getByRole('button', { name: 'Repetir configuração de Sortear números' }) }).count() >= 1, true);
    });
    await t.test('history: repeating a wheel result spins the wheel again', async () => {
      await page.locator('[data-tab=names]').click();
      await page.locator('#items').fill('Ana\nBruno\nCarla');
      await page.locator('#excludeWinners').uncheck();
      await page.locator('#winners').fill('1');
      await page.locator('#spin').click();
      await page.waitForFunction(() => !document.querySelector('#spin').disabled, null, { timeout: 8000 });
      const wheelItem = page.locator('#history li').filter({ hasText: 'Roleta de nomes' }).first();
      await wheelItem.getByRole('button', { name: /Repetir configuração/ }).click();
      await page.waitForFunction(() => !document.querySelector('#spin').disabled, null, { timeout: 8000 });
      assert.equal(await page.locator('#wheelWinner').isVisible(), true);
      assert.match(await page.locator('#result').textContent(), /Nome sorteado pela roleta/);
    });
    await t.test('history: recent results remain visible with many favorites', async () => {
      await page.evaluate(() => {
        const entries = Array.from({ length: 30 }, (_, i) => ({
          label: 'Números', text: String(i), mode: 'numbers',
          fields: { min: '1', max: '100', qty: '1' }, favorite: true
        }));
        localStorage.setItem('su-history', JSON.stringify(entries));
      });
      await page.reload();
      await page.locator('[data-tab=numbers]').click();
      await page.locator('#min').fill('31');
      await page.locator('#max').fill('31');
      await page.locator('#qty').fill('1');
      await page.locator('#draw').click();
      assert.equal(await page.locator('#history li').count(), 21);
      assert.ok((await page.locator('#history').textContent()).includes('31'));
      assert.equal(await page.locator('#history li button[aria-pressed=true]').count(), 20);
    });
    await t.test('history: loading too many favorites keeps recent results', async () => {
      await page.evaluate(() => {
        const favorites = Array.from({ length: 25 }, (_, i) => ({
          label: 'Favorito', text: String(i), favorite: true
        }));
        const recent = Array.from({ length: 5 }, (_, i) => ({
          label: 'Recente', text: String(i), favorite: false
        }));
        localStorage.setItem('su-history', JSON.stringify([...favorites, ...recent]));
      });
      await page.reload();
      assert.equal(await page.locator('#history li').count(), 25);
      assert.equal(await page.locator('#history li button[aria-pressed=true]').count(), 20);
      assert.equal(await page.locator('#history li').filter({ hasText: 'Recente' }).count(), 5);
    });
    await t.test('history: invalid saved modes cannot be replayed', async () => {
      await page.evaluate(() => {
        localStorage.setItem('su-history', JSON.stringify([
          { label: 'Inválido', text: 'teste', mode: 'invalid', fields: { min: '1' } }
        ]));
      });
      await page.reload();
      assert.equal(await page.locator('#history li').count(), 1);
      assert.equal(await page.locator('#history li').getByRole('button', { name: /Repetir configuração/ }).count(), 0);
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
    assert.deepEqual(pageErrors, [], 'unexpected browser JavaScript errors');
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
