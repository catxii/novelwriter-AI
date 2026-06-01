ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN blocked_message TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN blocked_updated_at TEXT;

CREATE TABLE IF NOT EXISTS user_device_history (
  user_id TEXT NOT NULL,
  ip_address TEXT NOT NULL DEFAULT '',
  mac_address TEXT NOT NULL DEFAULT '',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, ip_address, mac_address),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_device_history_user_last_seen
  ON user_device_history(user_id, last_seen_at);
