let schemaReady = false;

export async function ensureDeliveryOperationsSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS delivery_outbox (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL CHECK (channel IN ('email','telegram','export')),
      message_type TEXT NOT NULL,
      recipient_reference TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      payload_reference TEXT,
      status TEXT NOT NULL CHECK (
        status IN ('queued','processing','delivered','failed','dead_letter','cancelled')
      ) DEFAULT 'queued',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_at TEXT,
      provider_response_id TEXT,
      error_category TEXT,
      last_error TEXT,
      created_by TEXT REFERENCES users(id),
      attempted_at TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_delivery_outbox_due
      ON delivery_outbox(status, next_attempt_at, created_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_delivery_outbox_channel_status
      ON delivery_outbox(channel, status, updated_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_invocations (
      id TEXT PRIMARY KEY,
      cron TEXT NOT NULL,
      correlation_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('running','passed','partial','failed')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_scheduled_invocations_started
      ON scheduled_invocations(started_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_job_runs (
      id TEXT PRIMARY KEY,
      invocation_id TEXT NOT NULL REFERENCES scheduled_invocations(id) ON DELETE CASCADE,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running','passed','failed')),
      duration_ms INTEGER,
      error_category TEXT,
      last_error TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job
      ON scheduled_job_runs(job_name, started_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_status
      ON scheduled_job_runs(status, started_at DESC)`),
  ]);
  schemaReady = true;
}
