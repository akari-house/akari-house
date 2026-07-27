CREATE TABLE house_directory_entries (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (
    category IN ('team', 'advisor', 'supporter', 'partner', 'provider')
  ),
  name TEXT NOT NULL,
  title TEXT,
  biography TEXT,
  image_key TEXT,
  website_url TEXT,
  x_url TEXT,
  linkedin_url TEXT,
  instagram_url TEXT,
  tiktok_url TEXT,
  youtube_url TEXT,
  telegram_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'published', 'archived')
  ),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX house_directory_public_order
  ON house_directory_entries(category, status, display_order, name);

CREATE INDEX house_directory_image_key
  ON house_directory_entries(image_key);
