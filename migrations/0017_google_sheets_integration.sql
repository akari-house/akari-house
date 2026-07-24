PRAGMA foreign_keys = ON;

CREATE TABLE google_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_google_oauth_states_expiry
  ON google_oauth_states(expires_at);

CREATE TABLE google_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_refresh_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  scope TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE iio_google_sheets (
  campaign_id TEXT PRIMARY KEY REFERENCES ambassador_campaigns(id) ON DELETE CASCADE,
  spreadsheet_id TEXT NOT NULL UNIQUE,
  spreadsheet_url TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

