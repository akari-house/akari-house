PRAGMA foreign_keys = ON;

CREATE TABLE relationship_records (
  id TEXT PRIMARY KEY,
  subject_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  relationship_type TEXT NOT NULL DEFAULT 'other'
    CHECK (relationship_type IN (
      'founder', 'investor', 'creator', 'partner', 'client', 'other'
    )),
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  strength TEXT NOT NULL DEFAULT 'known'
    CHECK (strength IN ('cold', 'known', 'warm', 'strong', 'trusted')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'dormant', 'paused', 'closed')),
  source TEXT NOT NULL DEFAULT '',
  introduced_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  first_interaction_at TEXT,
  last_interaction_at TEXT,
  next_action_at TEXT,
  next_action TEXT NOT NULL DEFAULT '',
  consent_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (consent_status IN ('unknown', 'granted', 'limited', 'opted_out')),
  conflict_note TEXT NOT NULL DEFAULT '',
  internal_note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    subject_user_id IS NOT NULL OR
    length(trim(display_name)) > 0 OR
    length(trim(email)) > 0
  )
);

CREATE INDEX idx_relationship_records_owner
  ON relationship_records(owner_user_id, status, next_action_at, updated_at DESC);
CREATE INDEX idx_relationship_records_subject
  ON relationship_records(subject_user_id, status, updated_at DESC);
CREATE INDEX idx_relationship_records_project
  ON relationship_records(project_id, status, updated_at DESC);
CREATE INDEX idx_relationship_records_type
  ON relationship_records(relationship_type, strength, updated_at DESC);

CREATE TABLE relationship_interactions (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationship_records(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL DEFAULT 'note'
    CHECK (interaction_type IN (
      'note', 'email', 'telegram', 'call', 'meeting', 'space',
      'introduction', 'campaign', 'fundraising', 'agreement', 'other'
    )),
  summary TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_relationship_interactions_record
  ON relationship_interactions(relationship_id, occurred_at DESC, created_at DESC);
CREATE INDEX idx_relationship_interactions_project
  ON relationship_interactions(project_id, occurred_at DESC);

CREATE TRIGGER trg_relationship_interaction_rollup
AFTER INSERT ON relationship_interactions
BEGIN
  UPDATE relationship_records
  SET first_interaction_at = CASE
        WHEN first_interaction_at IS NULL OR NEW.occurred_at < first_interaction_at
          THEN NEW.occurred_at
        ELSE first_interaction_at
      END,
      last_interaction_at = CASE
        WHEN last_interaction_at IS NULL OR NEW.occurred_at > last_interaction_at
          THEN NEW.occurred_at
        ELSE last_interaction_at
      END,
      updated_at = datetime('now')
  WHERE id = NEW.relationship_id;
END;
