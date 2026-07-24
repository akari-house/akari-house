CREATE TABLE IF NOT EXISTS launch_gate_results (
  check_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending','passed','failed','waived')) DEFAULT 'pending',
  environment TEXT NOT NULL DEFAULT 'production',
  evidence_reference TEXT,
  notes TEXT,
  tested_by TEXT REFERENCES users(id),
  tested_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_launch_gate_results_status
ON launch_gate_results(status, updated_at DESC);
