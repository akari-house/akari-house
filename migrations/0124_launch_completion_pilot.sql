PRAGMA foreign_keys = ON;

CREATE TABLE pilot_participants (
  id TEXT PRIMARY KEY,
  cohort_id TEXT NOT NULL REFERENCES pilot_cohorts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'completed', 'withdrawn')),
  device_notes TEXT NOT NULL DEFAULT '',
  evidence_consent TEXT NOT NULL DEFAULT 'notes_only'
    CHECK (evidence_consent IN ('none', 'notes_only', 'screenshots_allowed')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cohort_id, user_id)
);

CREATE INDEX idx_pilot_participants_cohort_status
  ON pilot_participants(cohort_id, status, updated_at DESC);
CREATE INDEX idx_pilot_participants_user
  ON pilot_participants(user_id, updated_at DESC);

CREATE TABLE pilot_task_results (
  id TEXT PRIMARY KEY,
  cohort_id TEXT NOT NULL REFERENCES pilot_cohorts(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES pilot_participants(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'passed', 'blocked', 'abandoned', 'not_applicable')),
  assistance_required INTEGER NOT NULL DEFAULT 0
    CHECK (assistance_required IN (0, 1)),
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  notes TEXT NOT NULL DEFAULT '',
  recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (participant_id, task_key)
);

CREATE INDEX idx_pilot_task_results_cohort_status
  ON pilot_task_results(cohort_id, status, task_key, updated_at DESC);
