PRAGMA foreign_keys = ON;

CREATE TABLE review_sla_policies (
  queue_key TEXT PRIMARY KEY
    CHECK (queue_key IN ('membership', 'verification', 'project_claim', 'moderation')),
  target_hours INTEGER NOT NULL CHECK (target_hours BETWEEN 1 AND 720),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO review_sla_policies (queue_key, target_hours) VALUES
  ('membership', 48),
  ('verification', 72),
  ('project_claim', 72),
  ('moderation', 24);

CREATE TABLE review_queue_state (
  item_key TEXT PRIMARY KEY,
  queue_key TEXT NOT NULL
    CHECK (queue_key IN ('membership', 'verification', 'project_claim', 'moderation')),
  assigned_to TEXT REFERENCES admin_users(user_id) ON DELETE SET NULL,
  waiting_on TEXT NOT NULL DEFAULT 'akari'
    CHECK (waiting_on IN ('akari', 'user')),
  waiting_since TEXT,
  paused_seconds INTEGER NOT NULL DEFAULT 0 CHECK (paused_seconds >= 0),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_review_queue_state_queue
  ON review_queue_state(queue_key, waiting_on, assigned_to, updated_at);
