-- v2.5: salas publicas de inscricao; execute antes de publicar a interface.
CREATE TABLE IF NOT EXISTS draw_rooms (
 id TEXT PRIMARY KEY,
 admin_hash TEXT NOT NULL,
 title TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 max_entries INTEGER NOT NULL DEFAULT 100 CHECK(max_entries BETWEEN 2 AND 500)
);
CREATE TABLE IF NOT EXISTS draw_room_entries (
 id TEXT PRIMARY KEY,
 room_id TEXT NOT NULL REFERENCES draw_rooms(id) ON DELETE CASCADE,
 display_name TEXT NOT NULL,
 name_key TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(room_id,name_key)
);
CREATE INDEX IF NOT EXISTS idx_draw_room_entries_room ON draw_room_entries(room_id,created_at);
CREATE INDEX IF NOT EXISTS idx_draw_rooms_expires ON draw_rooms(expires_at);
