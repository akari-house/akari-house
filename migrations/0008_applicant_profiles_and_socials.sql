PRAGMA foreign_keys = ON;

CREATE TABLE profile_social_accounts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL
    CHECK (platform IN ('x', 'linkedin', 'tiktok', 'instagram', 'facebook', 'youtube')),
  profile_url TEXT NOT NULL DEFAULT '',
  follower_count INTEGER
    CHECK (follower_count IS NULL OR follower_count >= 0),
  count_source TEXT NOT NULL DEFAULT 'member_reported'
    CHECK (count_source IN ('member_reported', 'official_api', 'verified_snapshot', 'unavailable')),
  sync_status TEXT NOT NULL DEFAULT 'manual'
    CHECK (sync_status IN ('manual', 'pending', 'synced', 'unsupported', 'error')),
  last_reported_at TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, platform)
);

CREATE TABLE social_metric_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL
    CHECK (platform IN ('x', 'linkedin', 'tiktok', 'instagram', 'facebook', 'youtube')),
  follower_count INTEGER NOT NULL CHECK (follower_count >= 0),
  source TEXT NOT NULL
    CHECK (source IN ('member_reported', 'official_api', 'verified_snapshot')),
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_social_accounts_sync
  ON profile_social_accounts(platform, sync_status, last_synced_at);
CREATE INDEX idx_social_metric_history
  ON social_metric_snapshots(user_id, platform, captured_at DESC);

CREATE TABLE interest_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest_type TEXT NOT NULL
    CHECK (interest_type IN ('ambassador', 'founder_projects', 'creator_projects', 'investor_projects', 'event_host')),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, interest_type)
);

CREATE INDEX idx_interest_requests_review
  ON interest_requests(status, interest_type, created_at);
