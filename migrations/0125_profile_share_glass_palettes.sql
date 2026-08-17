PRAGMA foreign_keys = ON;

CREATE TABLE profile_share_settings_r79 (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  design TEXT NOT NULL DEFAULT 'signature'
    CHECK (design IN ('signature', 'passport')),
  orientation TEXT NOT NULL DEFAULT 'landscape'
    CHECK (orientation IN ('landscape', 'portrait')),
  palette TEXT NOT NULL DEFAULT 'midnight'
    CHECK (palette IN ('midnight', 'pearl', 'sakura', 'blossom', 'lantern')),
  country_code TEXT NOT NULL DEFAULT '',
  show_location INTEGER NOT NULL DEFAULT 0 CHECK (show_location IN (0, 1)),
  languages_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  show_languages INTEGER NOT NULL DEFAULT 1 CHECK (show_languages IN (0, 1))
);

INSERT INTO profile_share_settings_r79
  (user_id, design, orientation, palette, country_code, show_location,
   languages_json, updated_at, show_languages)
SELECT user_id,
       design,
       'landscape',
       CASE
         WHEN palette IN ('sakura', 'midnight', 'lantern') THEN palette
         ELSE 'midnight'
       END,
       country_code,
       show_location,
       languages_json,
       updated_at,
       show_languages
FROM profile_share_settings;

DROP TABLE profile_share_settings;
ALTER TABLE profile_share_settings_r79 RENAME TO profile_share_settings;

CREATE INDEX idx_profile_share_country ON profile_share_settings(country_code);
