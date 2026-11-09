-- Shared room draws. Immutable ordered results, deleted when the room expires.
CREATE TABLE IF NOT EXISTS draw_room_events (
 id TEXT PRIMARY KEY,
 room_id TEXT NOT NULL REFERENCES draw_rooms(id),
 round_number INTEGER NOT NULL,
 winner_name TEXT NOT NULL,
 drawn_at INTEGER NOT NULL,
 UNIQUE(room_id,round_number)
);
CREATE INDEX IF NOT EXISTS idx_draw_room_events_room ON draw_room_events(room_id,round_number);
