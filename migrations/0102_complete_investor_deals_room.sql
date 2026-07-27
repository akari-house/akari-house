PRAGMA foreign_keys = ON;

CREATE TABLE opportunity_sections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL
    CHECK (section_key IN (
      'problem_solution',
      'product_demo',
      'market_competition',
      'business_model',
      'traction',
      'team',
      'raise_information',
      'use_of_funds',
      'tokenomics',
      'risk_information'
    )),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'confidential'
    CHECK (visibility IN ('public', 'confidential')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'published', 'declined', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, section_key)
);

CREATE INDEX idx_opportunity_sections_room
  ON opportunity_sections(project_id, status, visibility, sort_order);

ALTER TABLE opportunity_updates
  ADD COLUMN decision_note TEXT NOT NULL DEFAULT '';

ALTER TABLE opportunity_questions
  ADD COLUMN decision_note TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_data_room_requests_latest
  ON data_room_requests(project_id, investor_user_id, created_at DESC);

CREATE INDEX idx_introduction_requests_investor
  ON introduction_requests(investor_user_id, status, created_at DESC);

CREATE INDEX idx_opportunity_questions_asked_by
  ON opportunity_questions(asked_by, status, created_at DESC);

CREATE INDEX idx_opportunity_updates_review
  ON opportunity_updates(status, created_at DESC);
