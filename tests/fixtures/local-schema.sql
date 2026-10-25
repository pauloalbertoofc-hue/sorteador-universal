-- Local fixture inferred from worker queries; never apply to production.
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id), mp_subscription_id TEXT, mp_plan_id TEXT, status TEXT NOT NULL, amount_cents INTEGER, currency TEXT, current_period_end TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS saved_lists (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT, list_type TEXT, items_json TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
