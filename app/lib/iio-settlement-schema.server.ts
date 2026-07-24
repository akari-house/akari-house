let iioSettlementSchemaReady = false;

export async function ensureIioSettlementSchema(db: D1Database) {
  if (iioSettlementSchemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS campaign_settlements (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      application_id TEXT NOT NULL UNIQUE,
      creator_user_id TEXT NOT NULL,
      original_allocation_cents INTEGER NOT NULL DEFAULT 0,
      final_amount_cents INTEGER NOT NULL DEFAULT 0,
      settlement_type TEXT NOT NULL DEFAULT 'cash',
      currency TEXT NOT NULL,
      token_symbol TEXT,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT,
      evidence_reference TEXT,
      transaction_reference TEXT,
      internal_note TEXT,
      approved_by TEXT,
      approved_at TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES ambassador_campaigns(id),
      FOREIGN KEY (application_id) REFERENCES campaign_applications(id),
      FOREIGN KEY (creator_user_id) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_campaign_settlements_campaign
      ON campaign_settlements(campaign_id, payment_status)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS campaign_settlement_adjustments (
      id TEXT PRIMARY KEY,
      settlement_id TEXT NOT NULL,
      previous_amount_cents INTEGER NOT NULL,
      new_amount_cents INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (settlement_id) REFERENCES campaign_settlements(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS campaign_disputes (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      creator_user_id TEXT NOT NULL,
      dispute_type TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence_url TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      resolution_note TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES ambassador_campaigns(id),
      FOREIGN KEY (application_id) REFERENCES campaign_applications(id),
      FOREIGN KEY (creator_user_id) REFERENCES users(id),
      FOREIGN KEY (resolved_by) REFERENCES users(id)
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_campaign_disputes_campaign
      ON campaign_disputes(campaign_id, status, created_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS campaign_final_reports (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      generated_by TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      finalized_at TEXT,
      summary_json TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES ambassador_campaigns(id),
      FOREIGN KEY (generated_by) REFERENCES users(id)
    )`),
  ]);
  iioSettlementSchemaReady = true;
}