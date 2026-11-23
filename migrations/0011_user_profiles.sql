-- Additive personal profile; existing authentication records remain unchanged.
CREATE TABLE IF NOT EXISTS user_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 full_name TEXT NOT NULL DEFAULT '',
 display_name TEXT NOT NULL DEFAULT '',
 username TEXT COLLATE NOCASE UNIQUE
);
