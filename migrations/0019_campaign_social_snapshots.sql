PRAGMA foreign_keys = ON;

ALTER TABLE campaign_applications ADD COLUMN tiktok_followers INTEGER NOT NULL DEFAULT 0
  CHECK (tiktok_followers >= 0);
ALTER TABLE campaign_applications ADD COLUMN instagram_followers INTEGER NOT NULL DEFAULT 0
  CHECK (instagram_followers >= 0);
ALTER TABLE campaign_applications ADD COLUMN youtube_followers INTEGER NOT NULL DEFAULT 0
  CHECK (youtube_followers >= 0);
