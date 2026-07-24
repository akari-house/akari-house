CREATE TABLE IF NOT EXISTS operational_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL CHECK (run_type IN ('d1_backup', 'd1_restore_test', 'r2_inventory', 'r2_cleanup', 'secret_rotation', 'incident_drill')),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'running', 'passed', 'failed', 'cancelled')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  initiated_by TEXT,
  evidence_reference TEXT,
  notes TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (initiated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_operational_runs_type_date
  ON operational_runs(run_type, started_at DESC);

CREATE TABLE IF NOT EXISTS managed_r2_objects (
  object_key TEXT PRIMARY KEY,
  owner_user_id TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  retention_status TEXT NOT NULL DEFAULT 'active' CHECK (retention_status IN ('active', 'hold', 'expired', 'soft_deleted', 'deleted')),
  expires_at TEXT,
  soft_deleted_at TEXT,
  deleted_at TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_managed_r2_retention
  ON managed_r2_objects(retention_status, expires_at);

CREATE TABLE IF NOT EXISTS incident_records (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL CHECK (severity IN ('sev1', 'sev2', 'sev3', 'sev4')),
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'contained', 'recovering', 'resolved', 'closed')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  owner_user_id TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  contained_at TEXT,
  resolved_at TEXT,
  postmortem_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_records_status
  ON incident_records(status, severity, detected_at DESC);

CREATE TABLE IF NOT EXISTS incident_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (incident_id) REFERENCES incident_records(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_events_incident
  ON incident_events(incident_id, created_at DESC);
