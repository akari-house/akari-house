let schemaReady = false;

export async function ensureAccountRightsSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS account_closure_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'cooling_off',
      reason TEXT,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      scheduled_for TEXT NOT NULL,
      cancelled_at TEXT,
      completed_at TEXT,
      reviewed_by TEXT,
      review_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_account_closure_due
      ON account_closure_requests(status, scheduled_for)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS data_export_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      expires_at TEXT,
      metadata_json TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_data_exports_user
      ON data_export_requests(user_id, requested_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS retention_runs (
      id TEXT PRIMARY KEY,
      run_type TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      affected_records INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT
    )`),
  ]);
  schemaReady = true;
}
