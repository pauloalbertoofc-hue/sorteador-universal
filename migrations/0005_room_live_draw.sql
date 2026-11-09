-- Shared room events: one authoritative result per room, retained only until room expiry.
CREATE TABLE IF NOT EXISTS draw_room_events (
 room_id TEXT PRIMARY KEY REFERENCES draw_rooms(id),
 event_id TEXT NOT NULL UNIQUE,
 winner_name TEXT NOT NULL,
 drawn_at INTEGER NOT NULL,
 FOREIGN KEY(room_id) REFERENCES draw_rooms(id)
);
CREATE INDEX IF NOT EXISTS idx_draw_room_events_drawn ON draw_room_events(drawn_at);
