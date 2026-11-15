-- Amigo Secreto: armazenamento privado, sem exposição dos pares por listagem pública.
-- Tokens são armazenados somente como hashes SHA-256, nunca em texto claro.
CREATE TABLE IF NOT EXISTS secret_santa_events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  admin_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','drawn','cancelled')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK(length(title) BETWEEN 3 AND 80),
  CHECK(expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS secret_santa_participants (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES secret_santa_events(id),
  display_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  recipient_id TEXT REFERENCES secret_santa_participants(id),
  revealed_at INTEGER,
  UNIQUE(event_id, name_key),
  CHECK(length(display_name) BETWEEN 1 AND 80),
  CHECK(recipient_id IS NULL OR recipient_id <> id)
);
CREATE INDEX IF NOT EXISTS idx_secret_santa_participants_event ON secret_santa_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_secret_santa_events_expiry ON secret_santa_events(expires_at);
