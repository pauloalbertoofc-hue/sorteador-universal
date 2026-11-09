-- Preserve existing rooms as registration-only; opt in to shared live draw per new room.
ALTER TABLE draw_rooms ADD COLUMN draw_mode TEXT NOT NULL DEFAULT 'classic' CHECK(draw_mode IN ('classic','live'));
