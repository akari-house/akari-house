PRAGMA foreign_keys = OFF;

ALTER TABLE notification_deliveries RENAME TO notification_deliveries_old;

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'email')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (notification_id, channel)
);

INSERT INTO notification_deliveries
SELECT * FROM notification_deliveries_old;

DROP TABLE notification_deliveries_old;

CREATE INDEX idx_notification_deliveries_pending
  ON notification_deliveries(channel, status, created_at);

PRAGMA foreign_keys = ON;
