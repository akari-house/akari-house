CREATE TABLE IF NOT EXISTS campaign_closeouts (
  campaign_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN (
      'active', 'delivery_complete', 'awaiting_approvals',
      'awaiting_settlement', 'settled', 'reporting',
      'client_delivered', 'closed', 'renewed'
    )),
  report_reference_url TEXT,
  report_sent_to TEXT,
  report_sent_by TEXT,
  report_sent_at TEXT,
  client_acknowledgement_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (client_acknowledgement_status IN (
      'pending', 'acknowledged', 'not_required'
    )),
  client_acknowledgement_note TEXT,
  client_acknowledged_by TEXT,
  client_acknowledged_at TEXT,
  closeout_note TEXT,
  closed_by TEXT,
  closed_at TEXT,
  renewal_type TEXT NOT NULL DEFAULT 'none'
    CHECK (renewal_type IN (
      'none', 'follow_up', 'renew_campaign', 'retainer', 'upsell_service'
    )),
  renewal_stage TEXT NOT NULL DEFAULT 'none'
    CHECK (renewal_stage IN ('none', 'planned', 'converted', 'declined')),
  renewal_follow_up_at TEXT,
  renewal_reference_url TEXT,
  renewal_note TEXT,
  renewal_recorded_by TEXT,
  renewal_recorded_at TEXT,
  renewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES ambassador_campaigns(id),
  FOREIGN KEY (report_sent_by) REFERENCES users(id),
  FOREIGN KEY (client_acknowledged_by) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id),
  FOREIGN KEY (renewal_recorded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_closeouts_status
  ON campaign_closeouts(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_closeouts_renewal
  ON campaign_closeouts(renewal_stage, renewal_follow_up_at);
