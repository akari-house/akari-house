PRAGMA foreign_keys = ON;

CREATE TABLE production_audit_runs (
  id TEXT PRIMARY KEY,
  commit_sha TEXT,
  environment TEXT NOT NULL DEFAULT 'production',
  status TEXT NOT NULL CHECK (status IN ('passed','failed')),
  checks_json TEXT NOT NULL DEFAULT '[]',
  workflow_url TEXT,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_production_audit_runs_completed
  ON production_audit_runs(completed_at DESC);

CREATE TABLE production_readiness_checks (
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
);

CREATE TABLE pilot_cohorts (
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
);

CREATE INDEX idx_pilot_cohorts_updated
  ON pilot_cohorts(updated_at DESC);

CREATE TABLE pilot_findings (
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
);

CREATE INDEX idx_pilot_findings_cohort_status
  ON pilot_findings(cohort_id, status, severity, created_at DESC);
