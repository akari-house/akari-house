PRAGMA foreign_keys = ON;

ALTER TABLE profiles ADD COLUMN avatar_key TEXT;
ALTER TABLE profiles ADD COLUMN avatar_content_type TEXT;
ALTER TABLE profiles ADD COLUMN avatar_updated_at TEXT;
