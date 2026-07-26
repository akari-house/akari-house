PRAGMA foreign_keys = ON;

CREATE TABLE investor_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (status IN (
      'claimed',
      'profile_complete',
      'verification_pending',
      'verified',
      'restricted',
      'rejected'
    )),
  sectors_json TEXT NOT NULL DEFAULT '[]',
  stages_json TEXT NOT NULL DEFAULT '[]',
  geographies_json TEXT NOT NULL DEFAULT '[]',
  minimum_ticket INTEGER,
  maximum_ticket INTEGER,
  ticket_currency TEXT NOT NULL DEFAULT 'USD',
  eligibility_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    minimum_ticket IS NULL OR
    maximum_ticket IS NULL OR
    minimum_ticket <= maximum_ticket
  )
);

INSERT OR IGNORE INTO investor_profiles (user_id, status)
SELECT ur.user_id,
       CASE WHEN rv.status = 'verified' THEN 'verified' ELSE 'claimed' END
FROM user_roles ur
LEFT JOIN role_verifications rv
  ON rv.user_id = ur.user_id AND rv.role = 'investor'
WHERE ur.role = 'investor';

CREATE INDEX idx_investor_profiles_status
  ON investor_profiles(status, updated_at DESC);

CREATE TRIGGER sync_investor_profile_after_role_insert
AFTER INSERT ON role_verifications
WHEN NEW.role = 'investor'
BEGIN
  INSERT INTO investor_profiles
    (user_id, status, reviewed_by, reviewed_at, decision_note, updated_at)
  VALUES (
    NEW.user_id,
    CASE NEW.status
      WHEN 'verified' THEN 'verified'
      WHEN 'pending' THEN 'verification_pending'
      WHEN 'revoked' THEN 'restricted'
      WHEN 'declined' THEN 'rejected'
      ELSE 'claimed'
    END,
    NEW.reviewed_by,
    NEW.reviewed_at,
    COALESCE(NEW.decision_note, ''),
    datetime('now')
  )
  ON CONFLICT(user_id) DO UPDATE SET
    status = excluded.status,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    decision_note = excluded.decision_note,
    updated_at = datetime('now');
END;

CREATE TRIGGER sync_investor_profile_after_role_update
AFTER UPDATE OF status, reviewed_by, reviewed_at, decision_note
ON role_verifications
WHEN NEW.role = 'investor'
BEGIN
  INSERT INTO investor_profiles
    (user_id, status, reviewed_by, reviewed_at, decision_note, updated_at)
  VALUES (
    NEW.user_id,
    CASE NEW.status
      WHEN 'verified' THEN 'verified'
      WHEN 'pending' THEN 'verification_pending'
      WHEN 'revoked' THEN 'restricted'
      WHEN 'declined' THEN 'rejected'
      ELSE 'claimed'
    END,
    NEW.reviewed_by,
    NEW.reviewed_at,
    COALESCE(NEW.decision_note, ''),
    datetime('now')
  )
  ON CONFLICT(user_id) DO UPDATE SET
    status = excluded.status,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    decision_note = excluded.decision_note,
    updated_at = datetime('now');
END;

CREATE TABLE opportunity_listings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  sector TEXT NOT NULL DEFAULT '',
  geography TEXT NOT NULL DEFAULT '',
  funding_instrument TEXT NOT NULL DEFAULT 'other'
    CHECK (funding_instrument IN (
      'equity', 'safe', 'convertible', 'token', 'grant', 'revenue_share', 'other'
    )),
  raise_minimum INTEGER,
  raise_maximum INTEGER,
  raise_currency TEXT NOT NULL DEFAULT 'USD',
  minimum_participation INTEGER,
  traction_stage TEXT NOT NULL DEFAULT '',
  closing_at TEXT,
  access_mode TEXT NOT NULL DEFAULT 'approved_only'
    CHECK (access_mode IN ('verified_investors', 'approved_only')),
  public_summary TEXT NOT NULL DEFAULT '',
  public_highlights TEXT NOT NULL DEFAULT '',
  risk_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'submitted', 'published', 'paused', 'closed', 'archived', 'declined'
    )),
  submitted_at TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    raise_minimum IS NULL OR
    raise_maximum IS NULL OR
    raise_minimum <= raise_maximum
  )
);

CREATE INDEX idx_opportunity_listings_catalogue
  ON opportunity_listings(status, closing_at, updated_at DESC);
CREATE INDEX idx_opportunity_listings_sector
  ON opportunity_listings(status, sector, updated_at DESC);

CREATE TABLE opportunity_user_states (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saved_at TEXT,
  passed_at TEXT,
  last_viewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id),
  CHECK (saved_at IS NULL OR passed_at IS NULL)
);

CREATE INDEX idx_opportunity_user_states_saved
  ON opportunity_user_states(user_id, saved_at DESC)
  WHERE saved_at IS NOT NULL;
CREATE INDEX idx_opportunity_user_states_passed
  ON opportunity_user_states(user_id, passed_at DESC)
  WHERE passed_at IS NOT NULL;

CREATE TABLE introduction_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  investor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn', 'completed')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_introduction_requests_active
  ON introduction_requests(project_id, investor_user_id)
  WHERE status IN ('pending', 'approved');
CREATE INDEX idx_introduction_requests_project
  ON introduction_requests(project_id, status, created_at DESC);

CREATE TABLE opportunity_questions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asked_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'answered', 'declined', 'withdrawn')),
  answered_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  answered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_opportunity_questions_project
  ON opportunity_questions(project_id, status, created_at DESC);

CREATE TABLE opportunity_updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'confidential'
    CHECK (visibility IN ('public', 'confidential')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'published', 'declined', 'archived')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_opportunity_updates_project
  ON opportunity_updates(project_id, status, visibility, created_at DESC);

ALTER TABLE project_documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'confidential'
  CHECK (visibility IN ('confidential', 'restricted'));
ALTER TABLE project_documents ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE project_documents ADD COLUMN approved_at TEXT;
ALTER TABLE project_documents ADD COLUMN approved_by TEXT REFERENCES users(id);
