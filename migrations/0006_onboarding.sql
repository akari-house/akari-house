PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN onboarding_started_at TEXT;

UPDATE users
SET onboarding_started_at = created_at
WHERE status = 'active';
