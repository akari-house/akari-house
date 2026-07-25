CREATE TABLE IF NOT EXISTS r2_inventory_findings (
  object_key TEXT NOT NULL,
  finding_type TEXT NOT NULL CHECK (finding_type IN ('orphan', 'missing')),
  source_type TEXT,
  source_id TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (object_key, finding_type)
);

CREATE INDEX IF NOT EXISTS idx_r2_inventory_findings_open
  ON r2_inventory_findings(finding_type, resolved_at, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_managed_r2_source
  ON managed_r2_objects(source_type, source_id);
