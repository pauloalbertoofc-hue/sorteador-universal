// Read-only preflight. Never creates plans, subscriptions or charges.
const token = process.env.MP_ACCESS_TOKEN, id = process.env.MP_PLAN_ID;
if (!token || !/^[a-f0-9]{32}$/i.test(id || '')) {
  console.error('Configure MP_ACCESS_TOKEN de forma segura e o verdadeiro MP_PLAN_ID (não um link nem Application ID).');
  process.exit(1);
}
async function get(path) {
  const r = await fetch('https://api.mercadopago.com' + path, {
    headers: {authorization: `Bearer ${token}`}, redirect: 'manual', signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw Error(`Consulta recusada pelo provedor (HTTP ${r.status}).`);
  return r.json();
}
try {
  const seller = await get('/users/me'), plan = await get('/preapproval_plan/' + encodeURIComponent(id));
  const a = plan.auto_recurring;
  if (plan.id !== id || String(plan.collector_id) !== String(seller.id) || plan.status !== 'active' || a?.frequency !== 1 || a.frequency_type !== 'months' || a.currency_id !== 'BRL' || Number(a.transaction_amount) !== 4.9 || a.free_trial || a.repetitions) throw Error('Plano incompatível: conferir titularidade, status, BRL 4,90/mês e ausência de trial/limite de repetições.');
  console.log('Plano existente compatível com a configuração comercial: R$ 4,90/mês, BRL, vendedor validado. Nenhuma cobrança foi criada.');
  console.log('Isto não valida checkout, webhook nem assinatura real. A homologação continua necessária.');
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Resposta inválida do provedor.' : error.message?.startsWith('Plano incompatível') || error.message?.startsWith('Consulta recusada') ? error.message : 'Não foi possível consultar o provedor. Verifique acesso e credenciais sem compartilhar seus valores.');
  process.exitCode = 1;
}
