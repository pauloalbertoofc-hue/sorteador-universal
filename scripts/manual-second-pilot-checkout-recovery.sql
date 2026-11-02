-- MANUAL ONLY: second pilot checkout recovery. NEVER run in CI or on deploy.
-- Prerequisites: new production Mercado Pago searches, independent review of
-- recent subscriptions/payments, fresh D1 backup, and operator approval.
-- This SQL intentionally refuses to proceed if timestamps differ.
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

-- Read-only preflight: inspect exact timestamps before editing the two
-- placeholders below. Do not execute this script with placeholders present.
-- SELECT attempt_id,created_at,updated_at,state,provider_id FROM billing_checkout
-- WHERE attempt_id='bb65be88-3318-4b1c-921c-34242cf7c4c8';

INSERT OR IGNORE INTO billing_checkout_recovery_audit
  (attempt_id,user_id,prior_state,prior_provider_id,original_created_at,original_updated_at,reason)
SELECT attempt_id,user_id,state,provider_id,created_at,updated_at,
       'Second pilot manual recovery: independently reviewed provider subscriptions and payments'
FROM billing_checkout
WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144'
  AND attempt_id='bb65be88-3318-4b1c-921c-34242cf7c4c8'
  AND state='creating' AND provider_id IS NULL
  AND created_at=1793490853024
  AND updated_at=1793490853024
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144')
  AND NOT EXISTS (SELECT 1 FROM billing_locks WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144' AND expires_at>CAST(unixepoch('now')*1000 AS INTEGER));

DELETE FROM billing_checkout
WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144'
  AND attempt_id='bb65be88-3318-4b1c-921c-34242cf7c4c8'
  AND state='creating' AND provider_id IS NULL
  AND created_at=1793490853024
  AND updated_at=1793490853024
  AND EXISTS (SELECT 1 FROM billing_checkout_recovery_audit a
              WHERE a.attempt_id=billing_checkout.attempt_id
                AND a.user_id=billing_checkout.user_id
                AND a.prior_state=billing_checkout.state
                AND a.prior_provider_id IS NULL
                AND a.original_created_at=billing_checkout.created_at
                AND a.original_updated_at=billing_checkout.updated_at)
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144')
  AND NOT EXISTS (SELECT 1 FROM billing_locks WHERE user_id='9f95ed18-8b4f-4cc5-b601-6216d9947144' AND expires_at>CAST(unixepoch('now')*1000 AS INTEGER));

SELECT (SELECT COUNT(*) FROM billing_checkout_recovery_audit WHERE attempt_id='bb65be88-3318-4b1c-921c-34242cf7c4c8') AS archived,
       (SELECT COUNT(*) FROM billing_checkout WHERE attempt_id='bb65be88-3318-4b1c-921c-34242cf7c4c8') AS still_blocked;
