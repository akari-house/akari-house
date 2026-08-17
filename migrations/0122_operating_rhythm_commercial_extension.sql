PRAGMA foreign_keys = ON;

CREATE TABLE attention_item_states_r75 (
  attention_key TEXT PRIMARY KEY,
  source_type TEXT NOT NULL
    CHECK (source_type IN (
      'relationship', 'agreement', 'diligence', 'introduction',
      'settlement', 'dispute', 'campaign_closeout', 'campaign_renewal',
      'review_sla', 'fundraising', 'invoice', 'workspace_subscription'
    )),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'snoozed', 'resolved', 'ignored')),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  snoozed_until TEXT,
  note TEXT NOT NULL DEFAULT '',
  resolved_at TEXT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(attention_key) BETWEEN 3 AND 300),
  CHECK (length(note) <= 2000)
);

INSERT INTO attention_item_states_r75
  (attention_key, source_type, source_id, status, assigned_to, snoozed_until,
   note, resolved_at, updated_by, created_at, updated_at)
SELECT attention_key, source_type, source_id, status, assigned_to, snoozed_until,
       note, resolved_at, updated_by, created_at, updated_at
FROM attention_item_states;

DROP TABLE attention_item_states;
ALTER TABLE attention_item_states_r75 RENAME TO attention_item_states;

CREATE INDEX idx_attention_item_states_status
  ON attention_item_states(status, snoozed_until, assigned_to, updated_at DESC);
CREATE INDEX idx_attention_item_states_source
  ON attention_item_states(source_type, source_id, updated_at DESC);

CREATE TABLE operating_report_runs_r75 (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL
    CHECK (report_type IN (
      'management_weekly', 'founder_weekly', 'fundraising_pipeline',
      'campaign_portfolio', 'relationship_followup', 'revenue'
    )),
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'finalized'
    CHECK (status IN ('draft', 'finalized')),
  generation_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (generation_source IN ('manual', 'scheduled')),
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  finalized_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  finalized_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(snapshot_json) <= 250000)
);

INSERT INTO operating_report_runs_r75
  (id, report_type, project_id, period_start, period_end, status,
   generation_source, snapshot_json, created_by, finalized_by, finalized_at, created_at)
SELECT id, report_type, project_id, period_start, period_end, status,
       generation_source, snapshot_json, created_by, finalized_by, finalized_at, created_at
FROM operating_report_runs;

DROP TABLE operating_report_runs;
ALTER TABLE operating_report_runs_r75 RENAME TO operating_report_runs;

CREATE UNIQUE INDEX idx_operating_report_runs_period
  ON operating_report_runs(
    report_type,
    COALESCE(project_id, ''),
    period_start,
    period_end
  );
CREATE INDEX idx_operating_report_runs_recent
  ON operating_report_runs(report_type, created_at DESC);
