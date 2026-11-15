// Motor do Amigo Secreto Universal. Um ciclo único impede autoatribuições
// e garante que cada participante dê e receba exatamente um presente.
export function normalizeParticipants(names) {
  if (!Array.isArray(names)) throw new TypeError('A lista deve ser um array.');
  const result = names.map(name => {
    if (typeof name !== 'string') throw new TypeError('Nome inválido.');
    return name.trim().replace(/\\s+/g, ' ');
  });
  if (result.length < 2 || result.length > 100) throw new RangeError('Informe de 2 a 100 participantes.');
  if (result.some(name => !name || name.length > 80)) throw new RangeError('Nome vazio ou longo demais.');
  if (new Set(result.map(name => name.toLocaleLowerCase('pt-BR'))).size !== result.length) throw new Error('Há nomes repetidos. Identifique cada participante de forma única.');
  return result;
}

// Inteiros uniformes com rejeição, sem viés de módulo.
export function secureRandomInt(max, cryptoApi = globalThis.crypto) {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new RangeError('Limite inválido.');
  if (!cryptoApi?.getRandomValues) throw new Error('Aleatoriedade segura indisponível.');
  const range = 0x100000000;
  const threshold = range - (range % max);
  const bytes = new Uint32Array(1);
  do { cryptoApi.getRandomValues(bytes); } while (bytes[0] >= threshold);
  return bytes[0] % max;
}

export function drawSecretSanta(names, cryptoApi = globalThis.crypto) {
  const participants = normalizeParticipants(names);
  const order = participants.map((_, index) => index);
  // Algoritmo de Sattolo: uma permutação cíclica sem pontos fixos.
  for (let i = order.length - 1; i > 0; i--) {
    const j = secureRandomInt(i, cryptoApi);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return participants.map((giver, index) => ({ giver, recipient: participants[order[index]] }));
}
