export async function ensureLaunchGateSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS launch_gate_results (
      check_key TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('pending','passed','failed','waived')) DEFAULT 'pending',
      environment TEXT NOT NULL DEFAULT 'production',
      evidence_reference TEXT,
      notes TEXT,
      tested_by TEXT REFERENCES users(id),
      tested_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_launch_gate_results_status
      ON launch_gate_results(status, updated_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS launch_gate_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK (source IN ('automated_preview','automated_production','manual_production')),
      environment TEXT NOT NULL,
      commit_sha TEXT,
      status TEXT NOT NULL CHECK (status IN ('running','passed','failed','cancelled')),
      report_reference TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_launch_gate_runs_environment
      ON launch_gate_runs(environment, started_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS launch_gate_evidence (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES launch_gate_runs(id) ON DELETE CASCADE,
      check_key TEXT NOT NULL,
      persona TEXT NOT NULL,
      route_or_action TEXT NOT NULL,
      expected_result TEXT NOT NULL,
      observed_result TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('passed','failed','skipped')),
      trace_reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_launch_gate_evidence_check
      ON launch_gate_evidence(check_key, created_at DESC)`),
  ]);
}
