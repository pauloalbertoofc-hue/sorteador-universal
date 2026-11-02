// Read-only plan checkout preflight. No subscription creation or payment requests.
// Usage: MP_ACCESS_TOKEN=... MP_PLAN_ID=... node scripts/mp-plan-checkout-preflight.mjs
const token = process.env.MP_ACCESS_TOKEN;
const planId = process.env.MP_PLAN_ID;
if (!token || !planId) {
  console.error('Configure MP_ACCESS_TOKEN e MP_PLAN_ID no ambiente.');
  process.exitCode = 2;
} else {
  try {
    const get = async path => {
      const res = await fetch('https://api.mercadopago.com' + path, {
        headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) throw Error('Falha na leitura do provedor: HTTP ' + res.status);
      return res.json();
    };
    const [seller, plan] = await Promise.all([
      get('/users/me'), get('/preapproval_plan/' + encodeURIComponent(planId))
    ]);
    const a = plan.auto_recurring || {};
    const url = new URL(plan.init_point);
    const trusted = url.protocol === 'https:' &&
      ['www.mercadopago.com.br', 'sandbox.mercadopago.com.br'].includes(url.hostname) &&
      url.pathname === '/subscriptions/checkout' &&
      url.searchParams.get('preapproval_plan_id') === String(planId) &&
      !url.username && !url.password && !url.port;
    const result = {
      plan_active: plan.status === 'active',
      seller_matches_plan: String(seller.id) === String(plan.collector_id),
      monthly_brl_490: Number(a.frequency) === 1 && a.frequency_type === 'months' &&
        a.currency_id === 'BRL' && Number(a.transaction_amount) === 4.9,
      hosted_checkout_url_valid: trusted,
      hosted_checkout_available: Boolean(plan.init_point)
    };
    console.log(JSON.stringify(result, null, 2));
    if (!Object.values(result).every(Boolean)) process.exitCode = 1;
  } catch (err) {
    console.error('Pré-verificação interrompida:', err.message);
    process.exitCode = 1;
  }
}
