-- Optional email second step; no plaintext codes are persisted.
CREATE TABLE IF NOT EXISTS user_email_mfa (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_mfa_challenges (
  challenge_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_mac TEXT NOT NULL,
  password_hash_snapshot TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  created_at INTEGER NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('login','enable','disable'))
);
CREATE INDEX IF NOT EXISTS email_mfa_challenges_user ON email_mfa_challenges(user_id,purpose,expires_at);
