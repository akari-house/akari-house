PRAGMA foreign_keys = ON;

CREATE TABLE profile_visibility (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'members', 'connections', 'private')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO profile_visibility (user_id, visibility)
SELECT user_id, visibility FROM profiles;

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC);
