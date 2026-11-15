import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const student = readFileSync(new URL('../public/sortear-aluno-online/index.html', import.meta.url), 'utf8');
const groups = readFileSync(new URL('../public/dividir-turma-em-grupos/index.html', import.meta.url), 'utf8');

test('student landing links contextually to classroom groups', () => {
  assert.match(student, /<h2>Sortear um aluno ou formar grupos\?<\/h2>/);
  assert.match(student, /href="\/dividir-turma-em-grupos\/"/);
  assert.match(student, /modelo=classroom&amp;incorporado=1/);
});

test('classroom groups landing links contextually to student selection', () => {
  assert.match(groups, /<h2>Quando sortear alunos individualmente\?<\/h2>/);
  assert.match(groups, /href="\/sortear-aluno-online\/"/);
  assert.match(groups, /modelo=groups&amp;incorporado=1/);
});
