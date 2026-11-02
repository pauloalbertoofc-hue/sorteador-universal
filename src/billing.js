// No card data enters this Worker. Provider responses never go into logs.
const API = 'https://api.mercadopago.com';
const PRICE = 490;
const DAY = 86400000;
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
export class BillingError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}
const denied = () => { throw new BillingError('Não foi possível validar a assinatura.', 502); };
const cents = value => Number.isFinite(Number(value)) && Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 1e-6 ? Math.round(Number(value) * 100) : NaN;
const date = value => typeof value === 'string' ? Date.parse(value) : NaN;
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
export const billingConfigured = env => !!(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET && /^[a-f0-9]{32}$/i.test(env.MP_PLAN_ID || '') && site(env));
function site(env) {
  try { const u = new URL(env.PUBLIC_SITE_URL); return u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? u.origin : null; } catch { return null; }
}
async function mp(env, path, {method = 'GET', body, key, allowNotFound = false} = {}) {
  if (!env.MP_ACCESS_TOKEN) throw new BillingError('Pagamento ainda não configurado.');
  let res;
  try {
    res = await fetch(API + path, {method, redirect: 'manual', signal: AbortSignal.timeout(8000), headers: {
      authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', ...(key ? {'X-Idempotency-Key': key} : {})
    }, ...(body ? {body: JSON.stringify(body)} : {})});
  } catch (error) {
    if (method === 'POST' && path === '/preapproval/') console.warn('[SU_BILLING] checkout_provider_diagnostic', {
      phase: 'transport', category: error?.name === 'TimeoutError' ? 'timeout' : 'network_failure'
    });
    throw new BillingError('Mercado Pago indisponível. Tente consultar sua assinatura novamente.', 502);
  }
  if (allowNotFound && res.status === 404) return null;
  if (!res.ok) {
    if (method === 'POST' && path === '/preapproval/') {
      // Only log an allowlisted provider classification; never print raw bodies,
      // account identifiers, payment details, access tokens or checkout URLs.
      let providerCode = 'unclassified';
      try {
        const payload = await res.json();
        const code = typeof payload?.code === 'string' ? payload.code : '';
        const safeCodes = new Set([
          'PA_UNAUTHORIZED_RESULT_FROM_POLICIES', 'PA_INVALID_IDENTIFICATION',
          'PA_INVALID_PAYER_EMAIL', 'PA_INVALID_PLAN_ID', 'PA_INVALID_STATUS',
          'PA_INVALID_BACK_URL', 'PA_INVALID_AUTO_RECURRING',
          'invalid_token', 'invalid_request', 'unauthorized', 'forbidden'
        ]);
        if (safeCodes.has(code)) providerCode = code;
      } catch { /* An error body may be absent or non-JSON. */ }
      console.warn('[SU_BILLING] checkout_provider_diagnostic', {
        phase: 'http', status: res.status, provider_code: providerCode,
        category: res.status === 401 || res.status === 403 ? 'credentials_or_permissions'
          : res.status === 400 || res.status === 422 ? 'provider_validation'
          : res.status === 429 ? 'provider_rate_limit'
          : res.status >= 500 ? 'provider_server_error' : 'other_http_error'
      });
    }
    throw new BillingError('Não foi possível confirmar a operação no Mercado Pago.', 502);
  }
  try { return await res.json(); } catch {
    if (method === 'POST' && path === '/preapproval/') console.warn('[SU_BILLING] checkout_provider_diagnostic', {phase: 'invalid_json'});
    throw new BillingError('Resposta inválida do Mercado Pago.', 502);
  }
}
async function searchAll(env, path) {
  const rows = [], seen = new Set();
  let total;
  for (let page = 0; page < 5; page++) {
    const result = await mp(env, `${path}&limit=100&offset=${rows.length}`);
    if (!Array.isArray(result.results) || !Number.isInteger(result.paging?.total) || result.paging.total < 0 || result.paging.total > 500 || (total !== undefined && total !== result.paging.total)) denied();
    total = result.paging.total;
    for (const item of result.results) {
      if (!idPattern.test(String(item.id)) || seen.has(String(item.id))) denied();
      seen.add(String(item.id)); rows.push(item);
    }
    if (rows.length === total) return rows;
    if (!result.results.length || rows.length > total) denied();
  }
  throw new BillingError('Histórico de cobrança requer reconciliação.', 502);
}
export const mpGet = (env, id, options = {}) => {
  if (!idPattern.test(String(id))) denied();
  return mp(env, `/preapproval/${encodeURIComponent(id)}`, options);
};
function schedule(value) {
  return value && value.frequency === 1 && value.frequency_type === 'months' && value.currency_id === 'BRL' && cents(value.transaction_amount) === PRICE && !value.free_trial && !value.repetitions;
}
async function context(env, requireActive = false) {
  if (!billingConfigured(env)) throw new BillingError('Pagamento ainda não configurado.');
  const seller = await mp(env, '/users/me');
  const plan = await mp(env, `/preapproval_plan/${encodeURIComponent(env.MP_PLAN_ID)}`);
  if (!sameId(plan.id, env.MP_PLAN_ID) || !sameId(plan.collector_id, seller.id) || !(requireActive ? ['active'] : ['active', 'inactive']).includes(plan.status) || !schedule(plan.auto_recurring)) {
    throw new BillingError('O plano precisa ser conferido pelo responsável antes de novas assinaturas.');
  }
  return {seller, plan};
}
function owned(sub, user, ctx, expectedId) {
  if (!sub || !idPattern.test(String(sub.id)) || (expectedId && !sameId(sub.id, expectedId)) || sub.external_reference !== user.id || !sameId(sub.collector_id, ctx.seller.id) || sub.preapproval_plan_id !== ctx.plan.id || !schedule(sub.auto_recurring)) denied();
  if (!['pending', 'authorized', 'paused', 'cancelled'].includes(sub.status)) denied();
  const end = sub.auto_recurring.end_date;
  if (end && !Number.isFinite(date(end))) denied();
  return sub;
}
// A hosted plan URL is not a user-specific subscription or proof of payment.
// This validator can be used by a future account-binding flow, but must never
// grant Pro access or bypass checkout intent reconciliation.
export function hostedPlanCheckoutUrl(plan, expectedPlanId) {
  try {
    if (!sameId(plan?.id, expectedPlanId) || !plan?.init_point) denied();
    const u = new URL(plan.init_point);
    if (u.protocol !== 'https:' ||
        !['www.mercadopago.com.br', 'sandbox.mercadopago.com.br'].includes(u.hostname) ||
        u.pathname !== '/subscriptions/checkout' ||
        u.searchParams.get('preapproval_plan_id') !== String(expectedPlanId) ||
        u.username || u.password || u.port || u.hash) denied();
    return u.href;
  } catch { throw new BillingError('Checkout do plano inválido.', 502); }
}
function checkoutUrl(sub) {
  try {
    const u = new URL(sub.init_point);
    if (u.protocol !== 'https:' || !['www.mercadopago.com.br', 'sandbox.mercadopago.com.br'].includes(u.hostname) || u.port || u.username || u.password || u.pathname !== '/subscriptions/checkout' || u.searchParams.get('preapproval_id') !== String(sub.id)) denied();
    return u.href;
  } catch { throw new BillingError('Checkout inválido. Consulte o responsável.', 502); }
}
async function withLock(env, userId, fn) {
  const owner = crypto.randomUUID(), now = Date.now();
  const acquired = await env.DB.prepare(`INSERT INTO billing_locks(user_id,owner,expires_at) VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
    WHERE billing_locks.expires_at<? RETURNING owner`).bind(userId, owner, now + 120000, now).first();
  if (acquired?.owner !== owner) throw new BillingError('Sua assinatura está sendo atualizada. Tente novamente em instantes.', 409);
  const fence = async () => {
    const row = await env.DB.prepare('SELECT owner FROM billing_locks WHERE user_id=? AND owner=? AND expires_at>?').bind(userId, owner, Date.now()).first();
    if (!row) throw new BillingError('Operação em reconciliação. Consulte sua assinatura novamente.', 409);
  };
  fence.write = async (sql, params) => {
    const n = params.length;
    const lease = `EXISTS (SELECT 1 FROM billing_locks WHERE user_id=?${n + 1} AND owner=?${n + 2} AND expires_at>?${n + 3})`;
    const result = await env.DB.prepare(sql.replaceAll('$LEASE', lease)).bind(...params, userId, owner, Date.now()).run();
    if (result.meta.changes !== 1) throw new BillingError('Operação em reconciliação. Consulte sua assinatura novamente.', 409);
  };
  try { return await fn(fence); }
  finally { await env.DB.prepare('DELETE FROM billing_locks WHERE user_id=? AND owner=?').bind(userId, owner).run(); }
}
async function local(env, userId) {
  return env.DB.prepare('SELECT * FROM subscriptions WHERE user_id=?').bind(userId).first();
}
function plusMonth(time) {
  const d = new Date(time), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return +d;
}
async function paidPeriod(env, sub) {
  // Search results are not a proof of payment: retrieve the linked payment too.
  const results = await searchAll(env, `/authorized_payments/search?preapproval_id=${encodeURIComponent(sub.id)}`);
  const now = Date.now();
  if (results.some(item => !Number.isFinite(date(item.debit_date)))) denied();
  const due = results.filter(item => date(item.debit_date) <= now).sort((a, b) => date(b.debit_date) - date(a.debit_date));
  if (!due.length) return {active: false, status: 'payment_pending'};
  // Unpaid attempts do not erase an already settled period after renewal ends.
  // Still fetch the selected settled payment below; a failed validation has no fallback.
  const charge = sub.status === 'cancelled' ? due.find(item => item.status === 'processed' && item.payment?.status === 'approved') : due[0];
  if (!charge) return {active: false, status: 'payment_pending'};
  if (due.filter(item => date(item.debit_date) === date(charge.debit_date)).length !== 1) throw new BillingError('Cobranças simultâneas requerem reconciliação.', 502);
  if (!sameId(charge.preapproval_id, sub.id)) denied();
  if (charge.status !== 'processed' || charge.payment?.status !== 'approved') return {active: false, status: 'payment_pending'};
  if (!idPattern.test(String(charge.payment.id))) denied();
  const payment = await mp(env, `/v1/payments/${encodeURIComponent(charge.payment.id)}`);
  if (!sameId(payment.id, charge.payment.id) || !sameId(payment.collector_id, sub.collector_id) || !sameId(payment.payer?.id, sub.payer_id) || payment.currency_id !== 'BRL' || cents(payment.transaction_amount) !== PRICE) denied();
  if (payment.status !== 'approved' || Number(payment.transaction_amount_refunded || 0) !== 0) return {active: false, status: 'payment_pending'};
  const approved = date(payment.date_approved), debit = date(charge.debit_date);
  if (!Number.isFinite(approved) || approved > now || !Number.isFinite(debit) || debit > now) denied();
  // Never extend a period merely because a late retry was approved today.
  // Cancelling the recurring contract does not shorten a settled monthly payment.
  // Contract end_date is not a refund or a paid-period boundary.
  const until = plusMonth(debit);
  return {active: until > now, status: until > now ? 'authorized' : 'expired', current_period_end: new Date(until).toISOString()};
}
function entitlement(renewal, state) {
  const now = Date.now(), until = state.current_period_end;
  const active = state.active === true && Number.isFinite(date(until)) && date(until) > now;
  const expired = !!until && date(until) <= now;
  return {
    active, status: renewal,
    renewal_status: renewal === 'authorized' ? 'active' : renewal,
    access_status: active ? (renewal === 'cancelled' ? 'pro_cancelled' : 'pro_active') : expired ? 'expired' : state.status === 'unverified' ? 'unverified' : 'free',
    ...(until ? {access_until: until, current_period_end: until} : {}),
    verified_at: now, can_cancel: ['authorized', 'pending', 'paused'].includes(renewal)
  };
}
export async function syncSubscription(env, user, sub, ctx, fence) {
  owned(sub, user, ctx, sub.id);
  const existing = await local(env, user.id);
  if (existing?.mp_subscription_id && existing.mp_subscription_id !== sub.id) denied();
  let state = {active: false, status: sub.status};
  if (['authorized', 'cancelled'].includes(sub.status)) state = await paidPeriod(env, sub);
  await fence();
  // Conditional write is a fence even if a process stalls beyond its lease.
  await fence.write(`INSERT INTO subscriptions(id,user_id,mp_subscription_id,mp_plan_id,status,amount_cents,currency,current_period_end)
    SELECT ?,?,?,?,?,490,'BRL',? WHERE $LEASE ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,mp_plan_id=excluded.mp_plan_id,
    current_period_end=excluded.current_period_end,updated_at=CURRENT_TIMESTAMP
    WHERE subscriptions.mp_subscription_id=excluded.mp_subscription_id AND $LEASE`, [crypto.randomUUID(), user.id, sub.id, ctx.plan.id, sub.status, state.current_period_end || null]);
  return entitlement(sub.status, state);
}
export async function subscriptionState(env, user) {
  const row = await local(env, user.id);
  if (!row?.mp_subscription_id) return {active: false, status: 'free', renewal_status: 'none', access_status: 'free', verified_at: Date.now(), can_cancel: false};
  if (!billingConfigured(env)) return {active: false, status: 'unverified', renewal_status: 'unverified', access_status: 'unverified', can_cancel: !!env.MP_ACCESS_TOKEN};
  try {
    return await withLock(env, user.id, async fence => {
      const ctx = await context(env), sub = owned(await mpGet(env, row.mp_subscription_id), user, ctx, row.mp_subscription_id);
      return syncSubscription(env, user, sub, ctx, fence);
    });
  } catch { return {active: false, status: 'unverified', renewal_status: 'unverified', access_status: 'unverified', can_cancel: true}; }
}
export async function billingInfo(env, user) {
  if (!checkoutAllowed(env, user) || !billingConfigured(env)) return {configured: false, amount_cents: PRICE, currency: 'BRL', interval: 'month'};
  try { await context(env, true); return {configured: true, amount_cents: PRICE, currency: 'BRL', interval: 'month'}; }
  catch { return {configured: false, amount_cents: PRICE, currency: 'BRL', interval: 'month'}; }
}
async function bindPending(env, user, sub, ctx, fence) {
  owned(sub, user, ctx, sub.id);
  await fence();
  await fence.write(`INSERT INTO subscriptions(id,user_id,mp_subscription_id,mp_plan_id,status,amount_cents,currency)
    SELECT ?,?,?,?,?,490,'BRL' WHERE $LEASE ON CONFLICT(user_id) DO UPDATE SET mp_subscription_id=excluded.mp_subscription_id,
    mp_plan_id=excluded.mp_plan_id,status=excluded.status,current_period_end=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE (subscriptions.mp_subscription_id IS NULL OR subscriptions.status='cancelled') AND $LEASE`, [crypto.randomUUID(), user.id, sub.id, ctx.plan.id, sub.status]);
  const row = await local(env, user.id);
  if (row.mp_subscription_id !== sub.id) denied();
  await fence.write("UPDATE billing_checkout SET state='bound',provider_id=?,updated_at=? WHERE user_id=? AND $LEASE", [sub.id, Date.now(), user.id]);
}
async function recover(env, user, ctx) {
  const results = await searchAll(env, `/preapproval/search?payer_email=${encodeURIComponent(user.email)}&preapproval_plan_id=${encodeURIComponent(ctx.plan.id)}`);
  const matches = results.filter(sub => sub.external_reference === user.id && sub.preapproval_plan_id === ctx.plan.id && sub.status !== 'cancelled');
  if (matches.length !== 1) throw new BillingError('Contratação em reconciliação. Não iniciaremos outra cobrança. Consulte novamente ou contate o responsável.', 409);
  return owned(await mpGet(env, matches[0].id), user, ctx, matches[0].id);
}
export function checkoutAllowed(env, user) {
  if (env.BILLING_ENABLED !== 'true') return false;
  if (env.BILLING_MODE === 'pilot') {
    return /^[a-f0-9-]{36}$/i.test(env.BILLING_PILOT_USER_ID || '') && user?.id === env.BILLING_PILOT_USER_ID;
  }
  // Public billing requires an explicit second switch; no accidental rollout.
  return env.BILLING_MODE === 'public';
}
export async function checkout(env, user) {
  if (!checkoutAllowed(env, user) || !billingConfigured(env)) throw new BillingError('Pagamento ainda não configurado.');
  return withLock(env, user.id, async fence => {
    const ctx = await context(env, true);
    const row = await local(env, user.id);
    if (row?.mp_subscription_id) {
      const sub = owned(await mpGet(env, row.mp_subscription_id), user, ctx, row.mp_subscription_id);
      if (sub.status === 'pending') return {checkout_url: checkoutUrl(sub)};
      if (sub.status !== 'cancelled') throw new BillingError('Você já possui uma assinatura. Consulte ou cancele seu plano antes de contratar novamente.', 409);
      const remaining = await syncSubscription(env, user, sub, ctx, fence);
      if (remaining.active) throw new BillingError('Você mantém acesso Pro até o fim do período pago. Aguarde o vencimento para contratar novamente.', 409);
      await fence();
      await fence.write("UPDATE subscriptions SET status='cancelled' WHERE user_id=? AND mp_subscription_id=? AND $LEASE", [user.id, sub.id]);
      row.status = 'cancelled';
    }
    const attempt = await env.DB.prepare('SELECT * FROM billing_checkout WHERE user_id=?').bind(user.id).first();
    if (attempt && !(attempt.state === 'bound' && row?.mp_subscription_id === attempt.provider_id && row.status === 'cancelled')) {
      const recovered = await recover(env, user, ctx);
      await bindPending(env, user, recovered, ctx, fence);
      if (recovered.status !== 'pending') throw new BillingError('Assinatura recuperada. Atualize seu plano para consultar o estado.', 409);
      return {checkout_url: checkoutUrl(recovered)};
    }
    const attemptId = crypto.randomUUID();
    await fence();
    await fence.write(`INSERT INTO billing_checkout(user_id,attempt_id,state,created_at,updated_at) SELECT ?,?,'creating',?,? WHERE $LEASE
      ON CONFLICT(user_id) DO UPDATE SET attempt_id=excluded.attempt_id,state='creating',provider_id=NULL,created_at=excluded.created_at,updated_at=excluded.updated_at WHERE $LEASE`, [user.id, attemptId, Date.now(), Date.now()]);
    // Persist the intent before POST. Never repeat an ambiguous POST, even if the provider ignores its idempotency header.
    const providerResponse = await mp(env, '/preapproval/', {method: 'POST', key: attemptId, body: {
      preapproval_plan_id: ctx.plan.id, reason: 'Sorteador Universal Pro', external_reference: user.id,
      payer_email: user.email, back_url: `${site(env)}/?billing=return`, status: 'pending'
    }});
    // Never print provider payloads, tokens, IDs, emails, or checkout URLs.
    let created;
    try { created = owned(providerResponse, user, ctx); }
    catch (error) {
      console.warn('[SU_BILLING] checkout_provider_diagnostic', {phase: 'response_validation'});
      throw error;
    }
    await bindPending(env, user, created, ctx, fence);
    if (created.status !== 'pending') throw new BillingError('Consulte o estado da sua assinatura antes de prosseguir.', 409);
    try { return {checkout_url: checkoutUrl(created)}; }
    catch (error) {
      console.warn('[SU_BILLING] checkout_provider_diagnostic', {phase: 'checkout_url_validation'});
      throw error;
    }
  });
}
export async function cancelSubscription(env, user) {
  return withLock(env, user.id, async fence => {
    const row = await local(env, user.id);
    if (!row?.mp_subscription_id) throw new BillingError('Nenhuma assinatura para cancelar.', 404);
    const seller = await mp(env, '/users/me'), sub = await mpGet(env, row.mp_subscription_id);
    if (!sameId(sub.id, row.mp_subscription_id) || sub.external_reference !== user.id || !sameId(sub.collector_id, seller.id)) denied();
    await fence();
    if (sub.status !== 'cancelled') await mp(env, `/preapproval/${encodeURIComponent(sub.id)}`, {method: 'PUT', body: {status: 'cancelled'}});
    const confirmed = await mpGet(env, sub.id);
    if (confirmed.status !== 'cancelled' || confirmed.external_reference !== user.id || !sameId(confirmed.collector_id, seller.id) || !sameId(confirmed.id, sub.id)) throw new BillingError('Cancelamento ainda não confirmado. Consulte novamente.', 502);
    await fence();
    await fence.write("UPDATE subscriptions SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND mp_subscription_id=? AND $LEASE", [user.id, sub.id]);
    // The provider has stopped recurrence. Payment verification may independently fail.
    try {
      const ctx = await context(env);
      owned(confirmed, user, ctx, sub.id);
      return {ok: true, subscription: await syncSubscription(env, user, confirmed, ctx, fence)};
    } catch {
      return {ok: true, subscription: {active: false, status: 'cancelled', renewal_status: 'cancelled', access_status: 'unverified', verified_at: Date.now(), can_cancel: false}};
    }
  });
}
const hex = buffer => [...new Uint8Array(buffer)].map(n => n.toString(16).padStart(2, '0')).join('');
async function digest(text) {return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));}
function equal(a, b) {if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0;}
// Only fixed rejection categories are logged; never log signatures or request identifiers.
function webhookReject(reason) {
  console.warn('[SU_BILLING] webhook_auth_rejected', {reason});
  throw new BillingError('Assinatura inválida.', 401);
}
export async function webhook(req, env, url) {
  if (!billingConfigured(env)) throw new BillingError('Webhook indisponível.');
  const raw = url.searchParams.get('data.id'), rid = req.headers.get('x-request-id') || '';
  const parts = (req.headers.get('x-signature') || '').split(',').map(s => s.trim().split('='));
  const ts = parts.filter(([key]) => key === 'ts'), sig = parts.filter(([key]) => key === 'v1');
  const stamp = ts[0]?.[1], signature = sig[0]?.[1];
  const numeric = Number(stamp), time = numeric < 1e12 ? numeric * 1000 : numeric;
  if (!raw || !idPattern.test(raw)) webhookReject('resource_id_missing_or_invalid');
  if (!rid || !/^[\w-]{1,128}$/.test(rid)) webhookReject('request_id_missing_or_invalid');
  if (ts.length !== 1 || sig.length !== 1 || !/^\d{10,16}$/.test(stamp || '') || !/^[a-f0-9]{64}$/i.test(signature || '')) webhookReject('signature_headers_missing_or_malformed');
  if (!Number.isFinite(time) || Math.abs(Date.now() - time) > 300000) webhookReject('timestamp_outside_window');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.MP_WEBHOOK_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`id:${raw.toLowerCase()};request-id:${rid};ts:${stamp};`)));
  if (!equal(expected, signature.toLowerCase())) {
    // Diagnostics contain only booleans and fixed labels; never log IDs, signatures, or secrets.
    // Alternative signatures are diagnostic ONLY: they must never authorize a webhook.
    const signVariant = async manifest => hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)));
    const alternatives = [
      ['id_case_preserved', `id:${raw};request-id:${rid};ts:${stamp};`],
      ['id_omitted', `id:;request-id:${rid};ts:${stamp};`],
      ['request_id_lowercase', `id:${raw.toLowerCase()};request-id:${rid.toLowerCase()};ts:${stamp};`]
    ];
    let diagnostic = 'no_known_variant';
    for (const [label, manifest] of alternatives) {
      if (manifest === `id:${raw.toLowerCase()};request-id:${rid};ts:${stamp};`) continue;
      if (equal(await signVariant(manifest), signature.toLowerCase())) { diagnostic = label; break; }
    }
    console.warn('[SU_BILLING] webhook_hmac_diagnostic', {
      variant: diagnostic,
      has_body: Number(req.headers.get('content-length') || 0) > 0,
      resource_id_alphanumeric: /[a-z]/i.test(raw),
      signature_header_present: true
    });
    webhookReject('hmac_mismatch');
  }
  const text = await req.text();
  if (text.length > 12000) throw new BillingError('Evento grande demais.', 413);
  let body; try { body = JSON.parse(text); } catch {throw new BillingError('Evento inválido.', 400);}
  if (String(body.data?.id) !== raw) throw new BillingError('Evento não corresponde à assinatura.', 400);
  const type = body.type || url.searchParams.get('type');
  if (!['subscription_preapproval', 'subscription_authorized_payment', 'payment'].includes(type)) return {ok: true, ignored: true};
  const eventKey = await digest(`${rid}:${stamp}:${signature.toLowerCase()}`);
  if (await env.DB.prepare('SELECT event_key FROM billing_events WHERE event_key=?').bind(eventKey).first()) return {ok: true, duplicate: true};
  let userId, providerId;
  if (type === 'subscription_preapproval') {
    const sub = await mpGet(env, raw, {allowNotFound: true});
    if (!sub) {console.info('[SU_BILLING] webhook_resource_not_found', {type}); return {ok: true, ignored: true};}
    userId = sub.external_reference; providerId = sub.id;
  }
  else if (type === 'subscription_authorized_payment') {
    const charge = await mp(env, `/authorized_payments/${encodeURIComponent(raw)}`, {allowNotFound: true});
    if (!charge) {console.info('[SU_BILLING] webhook_resource_not_found', {type}); return {ok: true, ignored: true};}
    if (!sameId(charge.id, raw) || !idPattern.test(String(charge.preapproval_id))) denied();
    const sub = await mpGet(env, charge.preapproval_id, {allowNotFound: true});
    if (!sub) {console.info('[SU_BILLING] webhook_resource_not_found', {type}); return {ok: true, ignored: true};}
    userId = sub.external_reference; providerId = sub.id;
  } else {
    const payment = await mp(env, `/v1/payments/${encodeURIComponent(raw)}`, {allowNotFound: true});
    if (!payment) {console.info('[SU_BILLING] webhook_resource_not_found', {type}); return {ok: true, ignored: true};}
    if (!sameId(payment.id, raw)) denied(); userId = payment.external_reference;
  }
  if (typeof userId !== 'string' || !/^[a-f0-9-]{36}$/i.test(userId)) return {ok: true, ignored: true};
  const user = await env.DB.prepare('SELECT id,email FROM users WHERE id=?').bind(userId).first();
  const row = await local(env, userId);
  if (!user || !row?.mp_subscription_id || (providerId && !sameId(providerId, row.mp_subscription_id))) return {ok: true, ignored: true};
  return withLock(env, userId, async fence => {
    if (await env.DB.prepare('SELECT event_key FROM billing_events WHERE event_key=?').bind(eventKey).first()) return {ok: true, duplicate: true};
    const ctx = await context(env), sub = owned(await mpGet(env, row.mp_subscription_id), user, ctx, row.mp_subscription_id);
    // Ignore event body state/order; reconcile the current canonical resources under the same lock as checkout.
    await syncSubscription(env, user, sub, ctx, fence);
    await fence();
    await fence.write('INSERT INTO billing_events(event_key,resource_type,resource_id,handled_at) SELECT ?,?,?,? WHERE $LEASE', [eventKey, type, raw, Date.now()]);
    return {ok: true};
  });
}
