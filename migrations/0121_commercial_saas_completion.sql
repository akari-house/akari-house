PRAGMA foreign_keys = ON;

CREATE TABLE saas_plans (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  monthly_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  seat_limit INTEGER NOT NULL DEFAULT 5 CHECK (seat_limit > 0),
  storage_limit_mb INTEGER NOT NULL DEFAULT 1024 CHECK (storage_limit_mb > 0),
  entitlements_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(trim(code)) BETWEEN 2 AND 50),
  CHECK (length(trim(name)) BETWEEN 2 AND 100),
  CHECK (length(currency) BETWEEN 3 AND 12)
);

INSERT INTO saas_plans
  (id, code, name, monthly_price_cents, currency, seat_limit, storage_limit_mb, entitlements_json)
VALUES
  ('plan-house-internal', 'house_internal', 'AKARI House Internal', 0, 'USD', 1000, 102400,
   '{"crm":true,"campaigns":true,"fundraising":true,"diligence":true,"relationships":true,"reporting":true,"finance":true}');

CREATE TABLE saas_workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'suspended', 'closed')),
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  primary_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  billing_email TEXT NOT NULL DEFAULT '',
  brand_name TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(trim(slug)) BETWEEN 2 AND 80),
  CHECK (length(trim(name)) BETWEEN 2 AND 120),
  CHECK (length(billing_email) <= 254),
  CHECK (length(brand_name) <= 120)
);

CREATE INDEX idx_saas_workspaces_status
  ON saas_workspaces(status, updated_at DESC);
CREATE INDEX idx_saas_workspaces_owner
  ON saas_workspaces(owner_user_id, status);

CREATE TABLE saas_workspace_members (
  workspace_id TEXT NOT NULL REFERENCES saas_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'finance', 'member')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_saas_workspace_members_user
  ON saas_workspace_members(user_id, status, workspace_id);

CREATE TABLE saas_workspace_project_links (
  workspace_id TEXT NOT NULL REFERENCES saas_workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  linked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, project_id)
);

CREATE TABLE saas_workspace_subscriptions (
  workspace_id TEXT PRIMARY KEY REFERENCES saas_workspaces(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES saas_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'suspended')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  trial_ends_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  external_billing_reference TEXT NOT NULL DEFAULT '',
  seat_limit_override INTEGER CHECK (seat_limit_override IS NULL OR seat_limit_override > 0),
  storage_limit_mb_override INTEGER CHECK (storage_limit_mb_override IS NULL OR storage_limit_mb_override > 0),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(external_billing_reference) <= 300)
);

CREATE INDEX idx_saas_subscriptions_status
  ON saas_workspace_subscriptions(status, trial_ends_at, current_period_end);

CREATE TABLE saas_workspace_module_entitlements (
  workspace_id TEXT NOT NULL REFERENCES saas_workspaces(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL
    CHECK (module_key IN ('crm', 'campaigns', 'fundraising', 'diligence', 'relationships', 'reporting', 'finance')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, module_key)
);

CREATE TABLE saas_workspace_invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES saas_workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'finance', 'member')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TEXT,
  accepted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(email) BETWEEN 3 AND 254)
);

CREATE INDEX idx_saas_workspace_invites
  ON saas_workspace_invitations(workspace_id, status, created_at DESC);

CREATE TABLE commercial_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
  workspace_id TEXT REFERENCES saas_workspaces(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES ambassador_campaigns(id) ON DELETE SET NULL,
  agreement_id TEXT REFERENCES agreement_records(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'void')),
  issued_at TEXT,
  due_at TEXT,
  external_invoice_url TEXT NOT NULL DEFAULT '',
  external_reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(trim(invoice_number)) BETWEEN 2 AND 80),
  CHECK (length(trim(customer_name)) BETWEEN 2 AND 160),
  CHECK (length(customer_email) <= 254),
  CHECK (length(currency) BETWEEN 3 AND 12),
  CHECK (discount_cents <= subtotal_cents + tax_cents),
  CHECK (length(external_invoice_url) <= 2000),
  CHECK (length(external_reference) <= 300),
  CHECK (length(note) <= 3000)
);

CREATE INDEX idx_commercial_invoices_status
  ON commercial_invoices(status, due_at, updated_at DESC);
CREATE INDEX idx_commercial_invoices_project
  ON commercial_invoices(project_id, status, issued_at DESC);
CREATE INDEX idx_commercial_invoices_workspace
  ON commercial_invoices(workspace_id, status, issued_at DESC);

CREATE TABLE commercial_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES commercial_invoices(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  refunded_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount_cents >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cleared', 'failed')),
  payment_method TEXT NOT NULL DEFAULT '',
  external_reference TEXT NOT NULL DEFAULT '',
  evidence_url TEXT NOT NULL DEFAULT '',
  paid_at TEXT,
  cleared_at TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (refunded_amount_cents <= amount_cents),
  CHECK (length(currency) BETWEEN 3 AND 12),
  CHECK (length(payment_method) <= 120),
  CHECK (length(external_reference) <= 300),
  CHECK (length(evidence_url) <= 2000)
);

CREATE INDEX idx_commercial_payments_invoice
  ON commercial_payments(invoice_id, status, created_at DESC);
CREATE INDEX idx_commercial_payments_status
  ON commercial_payments(status, cleared_at, created_at DESC);

CREATE TABLE commercial_cost_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES saas_workspaces(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES ambassador_campaigns(id) ON DELETE SET NULL,
  invoice_id TEXT REFERENCES commercial_invoices(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('vendor', 'software', 'media', 'contractor', 'travel', 'other')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'approved', 'paid', 'cancelled')),
  incurred_at TEXT,
  external_reference TEXT NOT NULL DEFAULT '',
  evidence_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(trim(description)) BETWEEN 2 AND 240),
  CHECK (length(currency) BETWEEN 3 AND 12),
  CHECK (length(external_reference) <= 300),
  CHECK (length(evidence_url) <= 2000),
  CHECK (length(note) <= 2000)
);

CREATE INDEX idx_commercial_costs_status
  ON commercial_cost_entries(status, incurred_at, created_at DESC);
CREATE INDEX idx_commercial_costs_project
  ON commercial_cost_entries(project_id, status, incurred_at DESC);
CREATE INDEX idx_commercial_costs_workspace
  ON commercial_cost_entries(workspace_id, status, incurred_at DESC);
