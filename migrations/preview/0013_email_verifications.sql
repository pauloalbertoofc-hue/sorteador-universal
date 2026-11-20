-- Email verification state and single-use challenge, scoped to the registered address.
CREATE TABLE IF NOT EXISTS email_verifications (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 email TEXT NOT NULL,
 token_hash TEXT UNIQUE,
 expires_at INTEGER,
 verified_at INTEGER
);
