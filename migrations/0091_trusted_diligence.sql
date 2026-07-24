CREATE TABLE IF NOT EXISTS document_access_grants (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  investor_user_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  can_download INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (document_id) REFERENCES project_documents(id),
  FOREIGN KEY (investor_user_id) REFERENCES users(id),
  FOREIGN KEY (granted_by) REFERENCES users(id),
  FOREIGN KEY (revoked_by) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_grant_unique_active
  ON document_access_grants(project_id, document_id, investor_user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_document_grants_investor
  ON document_access_grants(investor_user_id, expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS document_access_logs (
  id TEXT PRIMARY KEY,
  grant_id TEXT,
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('view', 'download', 'denied')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT,
  FOREIGN KEY (grant_id) REFERENCES document_access_grants(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (document_id) REFERENCES project_documents(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_document_access_logs_project
  ON document_access_logs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS data_room_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  investor_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'revoked', 'expired')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  decision_note TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (investor_user_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_data_room_request_active
  ON data_room_requests(project_id, investor_user_id)
  WHERE status IN ('pending', 'approved');

CREATE TABLE IF NOT EXISTS verification_provenance (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('founder', 'creator', 'investor')),
  verification_type TEXT NOT NULL DEFAULT 'role',
  evidence_category TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  review_due_at TEXT,
  last_refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (verified_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_verification_provenance_user
  ON verification_provenance(user_id, role, status, review_due_at);
