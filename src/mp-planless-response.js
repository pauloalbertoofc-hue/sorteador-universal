// Validates the provider response for a planless pending subscription.
// Pure and fail-closed: never grants entitlements or writes to D1.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const subscriptionId = /^[a-zA-Z0-9_-]{1,128}$/;
const allowedHosts = new Set(['www.mercadopago.com.br','sandbox.mercadopago.com.br']);
const cents = value => Number.isFinite(Number(value)) ? Math.round(Number(value)*100) : NaN;
export function validatePlanlessPendingSubscription({subscription,account,sellerId}) {
  if (!subscription || !account || !uuid.test(account.id || '') ||
      !subscriptionId.test(String(subscription.id || '')) ||
      subscription.external_reference !== account.id ||
      String(subscription.collector_id) !== String(sellerId) ||
      !sellerId ||
      subscription.preapproval_plan_id != null ||
      subscription.status !== 'pending' ||
      !subscription.auto_recurring ||
      subscription.auto_recurring.frequency !== 1 ||
      subscription.auto_recurring.frequency_type !== 'months' ||
      subscription.auto_recurring.currency_id !== 'BRL' ||
      cents(subscription.auto_recurring.transaction_amount) !== 490 ||
      subscription.auto_recurring.free_trial ||
      subscription.auto_recurring.repetitions ||
      String(subscription.payer_email || '').trim().toLowerCase() !== String(account.email || '').trim().toLowerCase() ||
      !account.email) throw Error('Unverified pending subscription');
  let url;
  try { url = new URL(subscription.init_point); }
  catch { throw Error('Untrusted checkout URL'); }
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) ||
      url.pathname !== '/subscriptions/checkout' ||
      url.searchParams.get('preapproval_id') !== String(subscription.id) ||
      url.username || url.password || url.port || url.hash)
    throw Error('Untrusted checkout URL');
  return {subscriptionId:String(subscription.id),checkoutUrl:url.href};
}
