PRAGMA foreign_keys = ON;

ALTER TABLE ambassador_campaigns ADD COLUMN registration_opens_at TEXT;
ALTER TABLE ambassador_campaigns ADD COLUMN starts_at TEXT;
ALTER TABLE ambassador_campaigns ADD COLUMN ends_at TEXT;
ALTER TABLE ambassador_campaigns ADD COLUMN posting_cadence TEXT NOT NULL DEFAULT 'weekly_3'
  CHECK (posting_cadence IN (
    'daily_posting', 'weekly_2', 'weekly_3', 'weekly_4', 'daily_engagement'
  ));

ALTER TABLE campaign_applications ADD COLUMN final_payout_cents INTEGER
  CHECK (final_payout_cents IS NULL OR final_payout_cents >= 0);
ALTER TABLE campaign_applications ADD COLUMN payout_decided_by TEXT
  REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE campaign_applications ADD COLUMN payout_decided_at TEXT;

CREATE TABLE campaign_work_submissions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES ambassador_campaigns(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES campaign_applications(id) ON DELETE CASCADE,
  creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  slot_number INTEGER NOT NULL CHECK (slot_number > 0),
  work_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved', 'rejected')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (application_id, period_start, slot_number)
);

CREATE INDEX idx_campaign_work_creator
  ON campaign_work_submissions(creator_user_id, campaign_id, period_start);
CREATE INDEX idx_campaign_work_review
  ON campaign_work_submissions(campaign_id, status, created_at);

CREATE TABLE campaign_moderators (
  campaign_id TEXT NOT NULL REFERENCES ambassador_campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES admin_users(user_id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE INDEX idx_campaign_moderators_user
  ON campaign_moderators(user_id, campaign_id);
