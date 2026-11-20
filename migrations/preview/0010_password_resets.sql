CREATE TABLE IF NOT EXISTS password_resets (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS password_resets_expiry ON password_resets(expires_at);
