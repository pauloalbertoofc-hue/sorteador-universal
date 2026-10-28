-- Incremental safety tables only. No existing payment_events schema assumptions.
-- Run on production ONLY after schema review, backup and explicit release approval.
CREATE TABLE IF NOT EXISTS billing_locks (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_checkout (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  attempt_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('creating','bound')),
  provider_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_events (
  event_key TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  handled_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_events_handled ON billing_events(handled_at);
