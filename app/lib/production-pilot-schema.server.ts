let schemaReady = false;

export async function ensureProductionPilotSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS production_audit_runs (
      id TEXT PRIMARY KEY,
      commit_sha TEXT,
      environment TEXT NOT NULL DEFAULT 'production',
      status TEXT NOT NULL CHECK (status IN ('passed','failed')),
      checks_json TEXT NOT NULL DEFAULT '[]',
      workflow_url TEXT,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_production_audit_runs_completed
      ON production_audit_runs(completed_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS production_readiness_checks (
      check_key TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (
        status IN ('pending','passed','failed','not_applicable')
      ) DEFAULT 'pending',
      evidence_reference TEXT,
      notes TEXT,
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      expires_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pilot_cohorts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stage TEXT NOT NULL CHECK (
        stage IN ('internal','invited_15','invited_25','invited_50','invited_100')
      ) DEFAULT 'internal',
      status TEXT NOT NULL CHECK (
        status IN ('planning','active','paused','completed')
      ) DEFAULT 'planning',
      target_size INTEGER NOT NULL DEFAULT 15 CHECK (target_size BETWEEN 1 AND 100),
      notes TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pilot_cohorts_updated
      ON pilot_cohorts(updated_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pilot_findings (
      id TEXT PRIMARY KEY,
      cohort_id TEXT NOT NULL REFERENCES pilot_cohorts(id) ON DELETE CASCADE,
      severity TEXT NOT NULL CHECK (
        severity IN ('critical','high','medium','low')
      ),
      area TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open','reviewing','resolved'))
        DEFAULT 'open',
      owner TEXT,
      resolution_notes TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pilot_findings_cohort_status
      ON pilot_findings(cohort_id, status, severity, created_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pilot_participants (
      id TEXT PRIMARY KEY,
      cohort_id TEXT NOT NULL REFERENCES pilot_cohorts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'invited'
        CHECK (status IN ('invited','active','completed','withdrawn')),
      device_notes TEXT NOT NULL DEFAULT '',
      evidence_consent TEXT NOT NULL DEFAULT 'notes_only'
        CHECK (evidence_consent IN ('none','notes_only','screenshots_allowed')),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (cohort_id, user_id)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pilot_participants_cohort_status
      ON pilot_participants(cohort_id, status, updated_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pilot_participants_user
      ON pilot_participants(user_id, updated_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pilot_task_results (
      id TEXT PRIMARY KEY,
      cohort_id TEXT NOT NULL REFERENCES pilot_cohorts(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES pilot_participants(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started','passed','blocked','abandoned','not_applicable')),
      assistance_required INTEGER NOT NULL DEFAULT 0
        CHECK (assistance_required IN (0, 1)),
      duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
      notes TEXT NOT NULL DEFAULT '',
      recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (participant_id, task_key)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pilot_task_results_cohort_status
      ON pilot_task_results(cohort_id, status, task_key, updated_at DESC)`),
  ]);
  schemaReady = true;
}
