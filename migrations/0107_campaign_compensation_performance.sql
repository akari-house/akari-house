PRAGMA foreign_keys = ON;

ALTER TABLE ambassador_campaigns ADD COLUMN payment_frequency TEXT NOT NULL DEFAULT 'monthly'
  CHECK (payment_frequency IN ('weekly', 'monthly', 'one_time', 'custom'));
ALTER TABLE ambassador_campaigns ADD COLUMN custom_payment_label TEXT NOT NULL DEFAULT '';
ALTER TABLE ambassador_campaigns ADD COLUMN maximum_allocation_cents INTEGER NOT NULL DEFAULT 0
  CHECK (maximum_allocation_cents >= 0);
ALTER TABLE ambassador_campaigns ADD COLUMN bonus_pool_cents INTEGER NOT NULL DEFAULT 0
  CHECK (bonus_pool_cents >= 0);
ALTER TABLE ambassador_campaigns ADD COLUMN maximum_bonus_per_creator_cents INTEGER NOT NULL DEFAULT 0
  CHECK (maximum_bonus_per_creator_cents >= 0);
ALTER TABLE ambassador_campaigns ADD COLUMN daily_engagement_required INTEGER NOT NULL DEFAULT 0
  CHECK (daily_engagement_required IN (0, 1));
ALTER TABLE ambassador_campaigns ADD COLUMN engagement_actions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ambassador_campaigns ADD COLUMN platform_weights_json TEXT NOT NULL
  DEFAULT '{"x":100,"youtube":0,"tiktok":0,"instagram":0}';
ALTER TABLE ambassador_campaigns ADD COLUMN roster_finalized_at TEXT;
ALTER TABLE ambassador_campaigns ADD COLUMN roster_finalized_by TEXT
  REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE campaign_applications ADD COLUMN selected_platforms_json TEXT NOT NULL DEFAULT '["x"]';
ALTER TABLE campaign_applications ADD COLUMN platform_commitments_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE campaign_applications ADD COLUMN engagement_accepted INTEGER NOT NULL DEFAULT 0
  CHECK (engagement_accepted IN (0, 1));
ALTER TABLE campaign_applications ADD COLUMN metrics_status TEXT NOT NULL DEFAULT 'unverified'
  CHECK (metrics_status IN ('unverified', 'verified', 'rejected'));
ALTER TABLE campaign_applications ADD COLUMN metrics_verified_by TEXT
  REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE campaign_applications ADD COLUMN metrics_verified_at TEXT;
ALTER TABLE campaign_applications ADD COLUMN metrics_verification_note TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_applications ADD COLUMN accepted_at TEXT;
ALTER TABLE campaign_applications ADD COLUMN declined_at TEXT;

CREATE TABLE campaign_content_items (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES ambassador_campaigns(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES campaign_applications(id) ON DELETE CASCADE,
  creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL
    CHECK (platform IN ('x', 'youtube', 'tiktok', 'instagram')),
  work_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved', 'rejected')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, work_url)
);

CREATE INDEX idx_campaign_content_creator
  ON campaign_content_items(campaign_id, creator_user_id, published_at DESC);
CREATE INDEX idx_campaign_content_review
  ON campaign_content_items(campaign_id, status, created_at);

CREATE TABLE campaign_content_metric_snapshots (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL REFERENCES campaign_content_items(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES ambassador_campaigns(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES campaign_applications(id) ON DELETE CASCADE,
  creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL
    CHECK (platform IN ('x', 'youtube', 'tiktok', 'instagram')),
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
  comments INTEGER NOT NULL DEFAULT 0 CHECK (comments >= 0),
  reposts INTEGER NOT NULL DEFAULT 0 CHECK (reposts >= 0),
  bookmarks INTEGER NOT NULL DEFAULT 0 CHECK (bookmarks >= 0),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'platform_api', 'partner_api', 'import')),
  verification_note TEXT NOT NULL DEFAULT '',
  is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1)),
  captured_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_campaign_metric_latest
  ON campaign_content_metric_snapshots(content_item_id, is_final, captured_at DESC);
CREATE INDEX idx_campaign_metric_campaign
  ON campaign_content_metric_snapshots(campaign_id, creator_user_id, captured_at DESC);

CREATE TABLE campaign_creator_bonuses (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES ambassador_campaigns(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES campaign_applications(id) ON DELETE CASCADE,
  creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  bonus_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_url TEXT NOT NULL DEFAULT '',
  period_label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('proposed', 'approved', 'paid', 'cancelled')),
  proposed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_campaign_bonus_campaign
  ON campaign_creator_bonuses(campaign_id, status, created_at DESC);
CREATE INDEX idx_campaign_bonus_creator
  ON campaign_creator_bonuses(application_id, status, created_at DESC);

CREATE TRIGGER notify_creator_campaign_commitment
AFTER INSERT ON campaign_applications
BEGIN
  INSERT INTO notifications (id, user_id, kind, title, body, action_url)
  SELECT lower(hex(randomblob(16))), NEW.creator_user_id,
         'campaign.commitment_required',
         'Confirm your campaign channels',
         'Choose the social platforms you will use and confirm the work you can deliver for this campaign.',
         '/campaigns/' || slug || '/commitment'
  FROM ambassador_campaigns WHERE id = NEW.campaign_id;
END;
