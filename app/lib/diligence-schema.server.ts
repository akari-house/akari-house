let ready = false;

export async function ensureDiligenceSchema(db: D1Database) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS document_access_grants (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, document_id TEXT NOT NULL,
      investor_user_id TEXT NOT NULL, granted_by TEXT NOT NULL,
      can_download INTEGER NOT NULL DEFAULT 1,
      starts_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL,
      revoked_at TEXT, revoked_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_document_grant_unique_active
      ON document_access_grants(project_id, document_id, investor_user_id)
      WHERE revoked_at IS NULL`),
    db.prepare(`CREATE TABLE IF NOT EXISTS document_access_logs (
      id TEXT PRIMARY KEY, grant_id TEXT, project_id TEXT NOT NULL,
      document_id TEXT NOT NULL, user_id TEXT NOT NULL,
      action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS data_room_requests (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, investor_user_id TEXT NOT NULL,
      reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT,
      reviewed_at TEXT, decision_note TEXT, expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_data_room_request_active
      ON data_room_requests(project_id, investor_user_id)
      WHERE status IN ('pending', 'approved')`),
    db.prepare(`CREATE TABLE IF NOT EXISTS verification_provenance (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL,
      verification_type TEXT NOT NULL DEFAULT 'role', evidence_category TEXT NOT NULL,
      verified_by TEXT NOT NULL, verified_at TEXT NOT NULL DEFAULT (datetime('now')),
      review_due_at TEXT, last_refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'active', note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
  ]);
  ready = true;
}
