-- Executar apenas após conferir as tabelas existentes no D1.
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
