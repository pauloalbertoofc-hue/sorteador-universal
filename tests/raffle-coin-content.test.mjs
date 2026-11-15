import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raffle = readFileSync(new URL('../public/sorteio-rifa-online/index.html', import.meta.url), 'utf8');
const coin = readFileSync(new URL('../public/cara-ou-coroa-online/index.html', import.meta.url), 'utf8');

test('raffle guidance distinguishes number ranges from eligible tickets', () => {
  assert.match(raffle, /não exclui números que não foram vendidos/);
  assert.match(raffle, /href="\/sortear-nomes\/"/);
  assert.match(raffle, /não substitui a verificação de elegibilidade/);
  assert.match(raffle, /modelo=raffle100&amp;incorporado=1/);
});

test('coin guidance covers two-option decisions and alternatives', () => {
  assert.match(coin, /Cara representa o quiz e Coroa representa a apresentação/);
  assert.match(coin, /href="\/roleta-online\/"/);
  assert.match(coin, /modelo=coin&amp;incorporado=1/);
});
