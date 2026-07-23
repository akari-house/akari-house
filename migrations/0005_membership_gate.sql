PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN email_verified_at TEXT;

CREATE TABLE membership_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_email'
    CHECK (status IN ('pending_email', 'pending_review', 'approved', 'declined', 'waitlisted')),
  applicant_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_membership_applications_status_created
  ON membership_applications(status, created_at);

CREATE TABLE account_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_account_tokens_user_purpose
  ON account_tokens(user_id, purpose, created_at DESC);
CREATE INDEX idx_account_tokens_expiry ON account_tokens(expires_at);

CREATE TABLE admin_users (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE status = 'active';

INSERT INTO membership_applications (id, user_id, status, reviewed_at)
SELECT lower(hex(randomblob(16))), id, 'approved', created_at
FROM users
WHERE status = 'active';
