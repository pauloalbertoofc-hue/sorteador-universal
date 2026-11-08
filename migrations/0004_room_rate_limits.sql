-- v2.5: counters for anonymous room writes (hourly buckets).
CREATE TABLE IF NOT EXISTS draw_room_rate_limits (
 key TEXT PRIMARY KEY,
 hits INTEGER NOT NULL DEFAULT 0,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_room_rate_limits_expires ON draw_room_rate_limits(expires_at);
