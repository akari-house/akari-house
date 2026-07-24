PRAGMA foreign_keys = ON;

ALTER TABLE projects ADD COLUMN data_room_url TEXT NOT NULL DEFAULT '';

CREATE TABLE project_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_project_documents_project
  ON project_documents(project_id, created_at);
