PRAGMA foreign_keys = ON;

ALTER TABLE admin_users ADD COLUMN access_level TEXT NOT NULL DEFAULT 'admin'
  CHECK (access_level IN ('admin', 'superadmin'));

UPDATE admin_users SET access_level = 'superadmin';

CREATE TABLE admin_scopes (
  admin_user_id TEXT NOT NULL REFERENCES admin_users(user_id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN (
    'membership', 'verification', 'projects', 'campaigns', 'moderation'
  )),
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (admin_user_id, scope)
);

CREATE TABLE role_verifications (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('founder', 'creator', 'investor')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'declined', 'revoked')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, role)
);

INSERT INTO role_verifications (user_id, role, status)
SELECT ur.user_id, ur.role, 'pending' FROM user_roles ur;

CREATE INDEX idx_role_verifications_status
  ON role_verifications(status, role, updated_at);

CREATE TABLE ambassador_campaigns (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  deliverables TEXT NOT NULL DEFAULT '',
  compensation TEXT NOT NULL DEFAULT '',
  application_deadline TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'published', 'declined', 'closed')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ambassador_campaigns_status
  ON ambassador_campaigns(status, updated_at DESC);
CREATE INDEX idx_ambassador_campaigns_project
  ON ambassador_campaigns(project_id, status);

CREATE TABLE campaign_applications (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES ambassador_campaigns(id) ON DELETE CASCADE,
  creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  portfolio_url TEXT NOT NULL DEFAULT '',
  contact_sharing INTEGER NOT NULL DEFAULT 0
    CHECK (contact_sharing IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'shortlisted', 'accepted', 'declined', 'withdrawn')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, creator_user_id)
);

CREATE INDEX idx_campaign_applications_campaign
  ON campaign_applications(campaign_id, status, created_at);
CREATE INDEX idx_campaign_applications_creator
  ON campaign_applications(creator_user_id, status, created_at);

CREATE TABLE project_social_links (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN (
    'website', 'x', 'linkedin', 'tiktok', 'instagram', 'facebook', 'youtube'
  )),
  url TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, platform)
);

CREATE TABLE project_team_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  linked_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  team_role TEXT NOT NULL DEFAULT '',
  social_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_project_team_members_project
  ON project_team_members(project_id, created_at);
