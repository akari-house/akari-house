PRAGMA foreign_keys = ON;

CREATE TABLE profile_contacts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL
    CHECK (contact_type IN ('email', 'telegram', 'phone', 'website')),
  contact_value TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'connections'
    CHECK (visibility IN ('private', 'connections', 'project_interests', 'connections_and_project_interests')),
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, contact_type)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  founder_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'idea'
    CHECK (stage IN ('idea', 'prototype', 'early_revenue', 'growth')),
  seeking TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'published', 'archived', 'declined')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_projects_status_updated ON projects(status, updated_at DESC);
CREATE INDEX idx_projects_founder_status ON projects(founder_user_id, status);

CREATE TABLE project_follows (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_follows_user ON project_follows(user_id, created_at DESC);

CREATE TABLE project_interests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  investor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'contacted', 'closed', 'withdrawn')),
  investor_shares_contact INTEGER NOT NULL DEFAULT 0 CHECK (investor_shares_contact IN (0, 1)),
  founder_shares_contact INTEGER NOT NULL DEFAULT 0 CHECK (founder_shares_contact IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, investor_user_id)
);

CREATE INDEX idx_project_interests_project
  ON project_interests(project_id, status, created_at DESC);
CREATE INDEX idx_project_interests_investor
  ON project_interests(investor_user_id, status, created_at DESC);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  action_url TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE telegram_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  telegram_user_id TEXT UNIQUE,
  telegram_username TEXT NOT NULL DEFAULT '',
  chat_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'unlinked'
    CHECK (status IN ('unlinked', 'pending', 'linked', 'revoked')),
  linked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE telegram_link_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_telegram_tokens_expiry
  ON telegram_link_tokens(expires_at);
