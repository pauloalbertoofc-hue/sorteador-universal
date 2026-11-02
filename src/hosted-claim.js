// Pure validation helpers for a future hosted-plan subscription claim.
// No provider calls, database writes, payments, or entitlement grants.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const email = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export function hostedClaimMatchesAccount({subscription, account, planId, collectorId}) {
  if (!subscription || !account || !uuid.test(account.id || '')) return false;
  if (typeof planId !== 'string' || !planId || !collectorId) return false;
  if (String(subscription.preapproval_plan_id) !== planId ||
      String(subscription.collector_id) !== String(collectorId)) return false;
  // A generic plan checkout does not automatically include external_reference.
  // Never use email-only matching: shared/changed addresses are not proof of ownership.
  if (subscription.external_reference !== account.id) return false;
  if (!email(account.email) || email(subscription.payer_email) !== email(account.email)) return false;
  if (!['pending','authorized','paused','cancelled'].includes(subscription.status)) return false;
  return true;
}
