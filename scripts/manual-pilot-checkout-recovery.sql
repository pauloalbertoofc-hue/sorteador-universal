-- MANUAL PILOT RECOVERY ONLY. Execute ONLY after a fresh independent Mercado Pago audit
-- returns zero results and the operator verifies no pending charges.
-- Scoped to one exact attempt; never use as a general-purpose migration.
-- Cloudflare D1: run as a single batch using wrangler d1 execute --file.
CREATE TABLE IF NOT EXISTS billing_checkout_recovery_audit (
  attempt_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  prior_state TEXT NOT NULL,
  prior_provider_id TEXT,
  original_created_at INTEGER NOT NULL,
  original_updated_at INTEGER NOT NULL,
  recovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason TEXT NOT NULL
);

INSERT OR IGNORE INTO billing_checkout_recovery_audit
  (attempt_id,user_id,prior_state,prior_provider_id,original_created_at,original_updated_at,reason)
SELECT attempt_id,user_id,state,provider_id,created_at,updated_at,
       'Manual pilot reconciliation: three independent provider searches returned zero; operator verified before execution'
FROM billing_checkout
WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144'
  AND attempt_id='426e9c76-1ed6-4d7c-969c-fc3ff6545f3a'
  AND state='creating' AND provider_id IS NULL
  AND created_at=1793485289683 AND updated_at=1793485289683
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144')
  AND NOT EXISTS (SELECT 1 FROM billing_locks WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144' AND expires_at>CAST(unixepoch('now')*1000 AS INTEGER));

-- Fail closed: only remove exactly the archived, unchanged, orphaned attempt.
DELETE FROM billing_checkout
WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144'
  AND attempt_id='426e9c76-1ed6-4d7c-969c-fc3ff6545f3a'
  AND state='creating' AND provider_id IS NULL
  AND created_at=1793485289683 AND updated_at=1793485289683
  AND EXISTS (SELECT 1 FROM billing_checkout_recovery_audit a
              WHERE a.attempt_id=billing_checkout.attempt_id
                AND a.user_id=billing_checkout.user_id
                AND a.prior_state=billing_checkout.state
                AND a.prior_provider_id IS NULL
                AND a.original_created_at=billing_checkout.created_at
                AND a.original_updated_at=billing_checkout.updated_at)
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144')
  AND NOT EXISTS (SELECT 1 FROM billing_locks WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144' AND expires_at>CAST(unixepoch('now')*1000 AS INTEGER));

SELECT (SELECT COUNT(*) FROM billing_checkout_recovery_audit WHERE attempt_id='426e9c76-1ed6-4d7c-969c-fc3ff6545f3a') AS archived,
       (SELECT COUNT(*) FROM billing_checkout WHERE attempt_id='426e9c76-1ed6-4d7c-969c-fc3ff6545f3a') AS still_blocked;
