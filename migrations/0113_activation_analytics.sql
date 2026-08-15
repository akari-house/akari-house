PRAGMA foreign_keys = ON;

CREATE TABLE activation_action_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('shown', 'clicked')),
  role TEXT NOT NULL DEFAULT '',
  target_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_activation_events_user_time
  ON activation_action_events(user_id, created_at DESC);

CREATE INDEX idx_activation_events_action_time
  ON activation_action_events(action_key, event_type, created_at DESC);

CREATE TABLE activation_milestones (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, milestone_key)
);

CREATE INDEX idx_activation_milestones_key_time
  ON activation_milestones(milestone_key, completed_at DESC);
