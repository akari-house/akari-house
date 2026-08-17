PRAGMA foreign_keys = ON;

CREATE TABLE project_fundraising_profiles (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  raise_target INTEGER,
  raise_currency TEXT NOT NULL DEFAULT 'USD',
  valuation INTEGER,
  funding_instrument TEXT NOT NULL DEFAULT 'other'
    CHECK (funding_instrument IN (
      'equity', 'safe', 'convertible', 'token', 'grant', 'revenue_share', 'other'
    )),
  minimum_participation INTEGER,
  traction_summary TEXT NOT NULL DEFAULT '',
  key_metrics TEXT NOT NULL DEFAULT '',
  use_of_funds TEXT NOT NULL DEFAULT '',
  monthly_burn INTEGER,
  runway_months INTEGER,
  current_revenue INTEGER,
  revenue_period TEXT NOT NULL DEFAULT 'monthly'
    CHECK (revenue_period IN ('monthly', 'annual', 'lifetime', 'other')),
  cap_table_reference TEXT NOT NULL DEFAULT '',
  pitch_deck_reference TEXT NOT NULL DEFAULT '',
  one_pager_reference TEXT NOT NULL DEFAULT '',
  financials_reference TEXT NOT NULL DEFAULT '',
  corporate_docs_reference TEXT NOT NULL DEFAULT '',
  token_relevant INTEGER NOT NULL DEFAULT 0 CHECK (token_relevant IN (0, 1)),
  tokenomics_reference TEXT NOT NULL DEFAULT '',
  closing_target TEXT,
  readiness_status TEXT NOT NULL DEFAULT 'in_preparation'
    CHECK (readiness_status IN (
      'in_preparation', 'needs_information', 'ready_for_outreach', 'paused'
    )),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (raise_target IS NULL OR raise_target >= 0),
  CHECK (valuation IS NULL OR valuation >= 0),
  CHECK (minimum_participation IS NULL OR minimum_participation >= 0),
  CHECK (monthly_burn IS NULL OR monthly_burn >= 0),
  CHECK (runway_months IS NULL OR runway_months >= 0),
  CHECK (current_revenue IS NULL OR current_revenue >= 0)
);

CREATE INDEX idx_project_fundraising_readiness_status
  ON project_fundraising_profiles(readiness_status, updated_at DESC);
