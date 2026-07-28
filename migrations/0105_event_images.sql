PRAGMA foreign_keys = ON;

ALTER TABLE events ADD COLUMN image_key TEXT;

CREATE INDEX idx_events_image_key ON events(image_key);
