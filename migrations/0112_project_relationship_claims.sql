PRAGMA foreign_keys = ON;

CREATE TABLE project_relationships (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL
    CHECK (relationship_type IN (
      'founder',
      'cofounder',
      'team_member',
      'advisor',
      'authorized_representative'
    )),
  claim_status TEXT NOT NULL DEFAULT 'self_declared'
    CHECK (claim_status IN (
      'self_declared',
      'pending',
      'verified',
      'disputed',
      'revoked'
    )),
  evidence_url TEXT NOT NULL DEFAULT '',
  evidence_note TEXT NOT NULL DEFAULT '',
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_relationships_user
  ON project_relationships(user_id, updated_at DESC);

CREATE INDEX idx_project_relationships_claim_queue
  ON project_relationships(claim_status, updated_at DESC);

INSERT OR IGNORE INTO project_relationships (
  project_id,
  user_id,
  relationship_type,
  claim_status,
  evidence_note
)
SELECT
  id,
  founder_user_id,
  'founder',
  'self_declared',
  'Backfilled from the existing canonical project owner.'
FROM projects;
