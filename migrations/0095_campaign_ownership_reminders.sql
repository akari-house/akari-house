CREATE TABLE IF NOT EXISTS campaign_ownership (
  campaign_id TEXT PRIMARY KEY,
  primary_moderator_id TEXT,
  backup_moderator_id TEXT,
  escalation_status TEXT NOT NULL DEFAULT 'normal' CHECK (escalation_status IN ('normal','attention','escalated')),
  internal_notes TEXT,
  assigned_by TEXT,
  assigned_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES ambassador_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (primary_moderator_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (backup_moderator_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS campaign_assignment_history (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  primary_moderator_id TEXT,
  backup_moderator_id TEXT,
  escalation_status TEXT NOT NULL,
  note TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES ambassador_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_campaign_assignment_history_campaign
  ON campaign_assignment_history(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_reminder_log (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  reminder_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','sent','failed','skipped')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  error_message TEXT,
  FOREIGN KEY (campaign_id) REFERENCES ambassador_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_reminder_log_campaign
  ON campaign_reminder_log(campaign_id, reminder_type, created_at DESC);
