import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { drawSecretSanta, normalizeParticipants, secureRandomInt } from '../public/amigo-secreto/engine.mjs';

test('normaliza participantes e rejeita duplicados, vazios e listas inválidas', () => {
  assert.deepEqual(normalizeParticipants([' Ana  Maria ', 'Bruno']), ['Ana Maria', 'Bruno']);
  for (const names of [[], ['Ana'], ['Ana',' ana '], ['Ana',''], Array(101).fill('Ana')]) assert.throws(() => normalizeParticipants(names));
});

test('todos dão e recebem exatamente uma vez, sem tirar a si mesmos', () => {
  for (let size = 2; size <= 100; size++) {
    const names = Array.from({length:size},(_,i)=>'Pessoa '+i);
    for(let trial=0;trial<10;trial++) {
      const pairs = drawSecretSanta(names,webcrypto);
      assert.equal(pairs.length,size);
      assert.deepEqual(new Set(pairs.map(p=>p.giver)),new Set(names));
      assert.deepEqual(new Set(pairs.map(p=>p.recipient)),new Set(names));
      assert.ok(pairs.every(p=>p.giver!==p.recipient));
    }
  }
});

test('aleatoriedade segura obrigatória e valores no intervalo', () => {
  assert.throws(()=>secureRandomInt(5,{}),/indisponível/);
  assert.throws(()=>secureRandomInt(0,webcrypto),RangeError);
  for(let i=0;i<100;i++) assert.ok(secureRandomInt(7,webcrypto)<7);
});
