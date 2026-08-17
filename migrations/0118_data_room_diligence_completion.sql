PRAGMA foreign_keys = ON;

CREATE TABLE project_diligence_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  nda_required INTEGER NOT NULL DEFAULT 0 CHECK (nda_required IN (0, 1)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE project_document_versions (
  document_id TEXT PRIMARY KEY REFERENCES project_documents(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  series_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  supersedes_document_id TEXT REFERENCES project_documents(id) ON DELETE SET NULL,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  version_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(version_note) <= 1000)
);

INSERT OR IGNORE INTO project_document_versions
  (document_id, project_id, series_id, version_number, is_current, created_at)
SELECT id, project_id, id, 1, 1, created_at
FROM project_documents;

CREATE UNIQUE INDEX idx_project_document_versions_series_version
  ON project_document_versions(series_id, version_number);
CREATE INDEX idx_project_document_versions_project_current
  ON project_document_versions(project_id, is_current, created_at DESC);

CREATE TRIGGER register_project_document_version_after_insert
AFTER INSERT ON project_documents
BEGIN
  INSERT OR IGNORE INTO project_document_versions
    (document_id, project_id, series_id, version_number, is_current, created_at)
  VALUES (NEW.id, NEW.project_id, NEW.id, 1, 1, NEW.created_at);
END;

CREATE TABLE opportunity_question_documents (
  question_id TEXT PRIMARY KEY REFERENCES opportunity_questions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_category TEXT NOT NULL DEFAULT 'other',
  document_id TEXT REFERENCES project_documents(id) ON DELETE SET NULL,
  due_at TEXT,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_opportunity_question_documents_project
  ON opportunity_question_documents(project_id, resolved_at, due_at, updated_at DESC);
CREATE INDEX idx_opportunity_question_documents_document
  ON opportunity_question_documents(document_id, project_id);

CREATE INDEX idx_agreement_records_project_nda_counterparty
  ON agreement_records(project_id, agreement_type, status, counterparty_email, expires_at);
