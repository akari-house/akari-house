PRAGMA foreign_keys = ON;

ALTER TABLE profile_share_settings ADD COLUMN show_languages INTEGER NOT NULL DEFAULT 1
  CHECK (show_languages IN (0, 1));

ALTER TABLE campaign_applications ADD COLUMN posting_days_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE events ADD COLUMN image_source_url TEXT NOT NULL DEFAULT '';

CREATE TABLE event_interests (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX idx_event_interests_user
  ON event_interests(user_id, created_at DESC);

CREATE INDEX idx_event_interests_event
  ON event_interests(event_id, created_at DESC);
