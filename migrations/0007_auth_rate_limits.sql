CREATE TABLE auth_rate_limits (
  bucket TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_started_at TEXT NOT NULL DEFAULT (datetime('now')),
  attempts INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, subject_hash)
);

CREATE INDEX idx_auth_rate_limits_window
  ON auth_rate_limits(window_started_at);
