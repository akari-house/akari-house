PRAGMA foreign_keys = ON;

ALTER TABLE saas_workspace_invitations ADD COLUMN token_hash TEXT;
ALTER TABLE saas_workspace_invitations ADD COLUMN sent_at TEXT;
ALTER TABLE saas_workspace_invitations ADD COLUMN delivery_id TEXT;
ALTER TABLE saas_workspace_invitations ADD COLUMN accepted_at TEXT;

CREATE UNIQUE INDEX idx_saas_workspace_invitation_token
  ON saas_workspace_invitations(token_hash)
  WHERE token_hash IS NOT NULL;
