PRAGMA foreign_keys = ON;

CREATE TABLE legal_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy TEXT NOT NULL
    CHECK (policy IN ('terms', 'privacy', 'community_guidelines')),
  action TEXT NOT NULL
    CHECK (action IN ('agreement', 'acknowledgement')),
  policy_version TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, policy, policy_version)
);

CREATE INDEX idx_legal_acceptances_user
  ON legal_acceptances(user_id, accepted_at DESC);
