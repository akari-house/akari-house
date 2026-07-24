let schemaReady = false;

export async function ensureProductionSecuritySchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      event_type TEXT NOT NULL,
      outcome TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_security_events_created
      ON security_events(created_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_security_events_actor
      ON security_events(actor_user_id, created_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_security_events_type
      ON security_events(event_type, outcome, created_at DESC)`),
  ]);
  schemaReady = true;
}
