PRAGMA foreign_keys = ON;

CREATE TABLE profile_share_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  design TEXT NOT NULL DEFAULT 'signature' CHECK (design IN ('signature', 'passport')),
  orientation TEXT NOT NULL DEFAULT 'landscape' CHECK (orientation IN ('landscape', 'portrait')),
  palette TEXT NOT NULL DEFAULT 'sakura' CHECK (palette IN ('sakura', 'midnight', 'lantern')),
  country_code TEXT NOT NULL DEFAULT '',
  show_location INTEGER NOT NULL DEFAULT 0 CHECK (show_location IN (0, 1)),
  languages_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE profile_reputation_signals (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sorsa_score REAL,
  sorsa_source TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (sorsa_source IN ('official_api', 'partner_verified', 'member_reported', 'unavailable')),
  x_score REAL,
  x_score_source TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (x_score_source IN ('official_api', 'partner_verified', 'member_reported', 'unavailable')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_profile_share_country ON profile_share_settings(country_code);
