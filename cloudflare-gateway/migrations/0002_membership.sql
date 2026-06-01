CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'normal',
  expires_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS membership_recharges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  source TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 0,
  code TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_tier ON memberships(tier);
CREATE INDEX IF NOT EXISTS idx_membership_recharges_user_time ON membership_recharges(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_recharges_code ON membership_recharges(code) WHERE code IS NOT NULL;
