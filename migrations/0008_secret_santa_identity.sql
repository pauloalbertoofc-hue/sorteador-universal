-- Schema expansion only. Apply after 0007; no existing event is modified or deleted.
-- Legacy events retain mode='links' and owner_user_id=NULL.
ALTER TABLE secret_santa_events ADD COLUMN owner_user_id TEXT REFERENCES users(id);
ALTER TABLE secret_santa_events ADD COLUMN distribution_mode TEXT NOT NULL DEFAULT 'links' CHECK(distribution_mode IN ('links','protected'));
CREATE INDEX IF NOT EXISTS idx_secret_santa_events_owner ON secret_santa_events(owner_user_id, created_at);

-- One-time guest entry credentials: store hashes only; never store plaintext secrets.
-- Credential redemption and temporary session APIs are NOT enabled by this migration.
CREATE TABLE IF NOT EXISTS secret_santa_guest_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES secret_santa_events(id),
  participant_id TEXT NOT NULL REFERENCES secret_santa_participants(id),
  credential_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  redeemed_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(event_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_secret_santa_guest_credentials_expiry ON secret_santa_guest_credentials(expires_at);

CREATE TABLE IF NOT EXISTS secret_santa_guest_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES secret_santa_events(id),
  participant_id TEXT NOT NULL REFERENCES secret_santa_participants(id),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_secret_santa_guest_sessions_expiry ON secret_santa_guest_sessions(expires_at);
