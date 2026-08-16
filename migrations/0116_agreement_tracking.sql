PRAGMA foreign_keys = ON;

CREATE TABLE agreement_records (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agreement_type TEXT NOT NULL DEFAULT 'other'
    CHECK (agreement_type IN (
      'service', 'campaign', 'nda', 'advisory', 'fundraising', 'partnership', 'other'
    )),
  status TEXT NOT NULL DEFAULT 'required'
    CHECK (status IN (
      'required', 'with_lawyer', 'ready_to_send', 'sent', 'negotiation',
      'signed', 'expired', 'terminated', 'not_required'
    )),
  counterparty_name TEXT NOT NULL,
  counterparty_email TEXT NOT NULL DEFAULT '',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES ambassador_campaigns(id) ON DELETE SET NULL,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  external_document_url TEXT NOT NULL DEFAULT '',
  external_reference TEXT NOT NULL DEFAULT '',
  requested_at TEXT,
  sent_at TEXT,
  signed_at TEXT,
  effective_at TEXT,
  expires_at TEXT,
  next_follow_up_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(trim(title)) BETWEEN 3 AND 160),
  CHECK (length(trim(counterparty_name)) BETWEEN 2 AND 160),
  CHECK (length(counterparty_email) <= 254),
  CHECK (length(external_document_url) <= 2000),
  CHECK (length(external_reference) <= 300),
  CHECK (length(note) <= 3000)
);

CREATE INDEX idx_agreement_records_status
  ON agreement_records(status, next_follow_up_at, expires_at, updated_at DESC);
CREATE INDEX idx_agreement_records_project
  ON agreement_records(project_id, status, updated_at DESC);
CREATE INDEX idx_agreement_records_campaign
  ON agreement_records(campaign_id, status, updated_at DESC);
CREATE INDEX idx_agreement_records_owner
  ON agreement_records(owner_user_id, status, next_follow_up_at);
