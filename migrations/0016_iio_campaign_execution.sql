PRAGMA foreign_keys = ON;

ALTER TABLE ambassador_campaigns ADD COLUMN campaign_kind TEXT NOT NULL DEFAULT 'ambassador'
  CHECK (campaign_kind IN ('ambassador', 'iio'));
ALTER TABLE ambassador_campaigns ADD COLUMN budget_cents INTEGER NOT NULL DEFAULT 0
  CHECK (budget_cents >= 0);
ALTER TABLE ambassador_campaigns ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE ambassador_campaigns ADD COLUMN weight_followers INTEGER NOT NULL DEFAULT 40
  CHECK (weight_followers BETWEEN 0 AND 100);
ALTER TABLE ambassador_campaigns ADD COLUMN weight_x_score INTEGER NOT NULL DEFAULT 30
  CHECK (weight_x_score BETWEEN 0 AND 100);
ALTER TABLE ambassador_campaigns ADD COLUMN weight_sorsa_score INTEGER NOT NULL DEFAULT 30
  CHECK (weight_sorsa_score BETWEEN 0 AND 100);
ALTER TABLE ambassador_campaigns ADD COLUMN finalized_at TEXT;

ALTER TABLE campaign_applications ADD COLUMN creator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_applications ADD COLUMN x_url TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_applications ADD COLUMN tiktok_url TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_applications ADD COLUMN instagram_url TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_applications ADD COLUMN youtube_url TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_applications ADD COLUMN x_followers INTEGER NOT NULL DEFAULT 0
  CHECK (x_followers >= 0);
ALTER TABLE campaign_applications ADD COLUMN x_score REAL NOT NULL DEFAULT 0
  CHECK (x_score >= 0);
ALTER TABLE campaign_applications ADD COLUMN sorsa_score REAL NOT NULL DEFAULT 0
  CHECK (sorsa_score >= 0);
ALTER TABLE campaign_applications ADD COLUMN akari_score REAL NOT NULL DEFAULT 0
  CHECK (akari_score >= 0);
ALTER TABLE campaign_applications ADD COLUMN payout_cents INTEGER NOT NULL DEFAULT 0
  CHECK (payout_cents >= 0);
ALTER TABLE campaign_applications ADD COLUMN payout_percent REAL NOT NULL DEFAULT 0
  CHECK (payout_percent >= 0);
ALTER TABLE campaign_applications ADD COLUMN deliverables_accepted INTEGER NOT NULL DEFAULT 0
  CHECK (deliverables_accepted IN (0, 1));

CREATE INDEX idx_iio_campaigns_status
  ON ambassador_campaigns(campaign_kind, status, updated_at DESC);

