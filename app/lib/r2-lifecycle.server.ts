import { sanitizeDeliveryError } from "./delivery-policy";
import { ensureOperationalResilienceSchema } from "./operational-resilience-schema.server";

const managedPrefixes = [
  "profile-photos/",
  "project-documents/",
  "delivery-payloads/",
  "recovery-backups/",
] as const;

export type ManagedR2SourceType =
  "profile_photo" | "project_document" | "delivery_payload" | "d1_backup";

export async function registerManagedR2Object(
  db: D1Database,
  input: {
    objectKey: string;
    sourceType: ManagedR2SourceType;
    sourceId?: string | null;
    ownerUserId?: string | null;
    expiresAtModifier?: string | null;
    retentionStatus?: "active" | "hold";
  },
) {
  await ensureOperationalResilienceSchema(db);
  await db
    .prepare(
      `INSERT INTO managed_r2_objects
       (object_key, owner_user_id, source_type, source_id, retention_status,
        expires_at, soft_deleted_at, deleted_at, updated_at)
       VALUES (?, ?, ?, ?, ?,
         CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?) END,
         NULL, NULL, datetime('now'))
       ON CONFLICT(object_key) DO UPDATE SET
         owner_user_id = excluded.owner_user_id,
         source_type = excluded.source_type,
         source_id = excluded.source_id,
         retention_status = excluded.retention_status,
         expires_at = excluded.expires_at,
         soft_deleted_at = NULL,
         deleted_at = NULL,
         updated_at = datetime('now')`,
    )
    .bind(
      input.objectKey,
      input.ownerUserId ?? null,
      input.sourceType,
      input.sourceId ?? null,
      input.retentionStatus ?? "active",
      input.expiresAtModifier ?? null,
      input.expiresAtModifier ?? null,
    )
    .run();
}

export async function markManagedR2ObjectDeleted(
  db: D1Database,
  objectKey: string,
) {
  await ensureOperationalResilienceSchema(db);
  await db
    .prepare(
      `UPDATE managed_r2_objects
       SET retention_status = 'deleted', deleted_at = datetime('now'),
           updated_at = datetime('now')
       WHERE object_key = ?`,
    )
    .bind(objectKey)
    .run();
}

export async function markManagedR2ObjectForDeletion(
  db: D1Database,
  objectKey: string,
) {
  await ensureOperationalResilienceSchema(db);
  await db
    .prepare(
      `UPDATE managed_r2_objects
       SET retention_status = 'soft_deleted',
           soft_deleted_at = COALESCE(soft_deleted_at, datetime('now')),
           updated_at = datetime('now')
       WHERE object_key = ? AND retention_status NOT IN ('hold', 'deleted')`,
    )
    .bind(objectKey)
    .run();
}

async function startOperationalRun(db: D1Database, runType: string) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO operational_runs (id, run_type, status, metadata_json)
       VALUES (?, ?, 'running', '{}')`,
    )
    .bind(id, runType)
    .run();
  return id;
}

async function finishOperationalRun(
  db: D1Database,
  runId: string,
  status: "passed" | "failed",
  metadata: Record<string, unknown>,
  notes?: string,
) {
  await db
    .prepare(
      `UPDATE operational_runs
       SET status = ?, completed_at = datetime('now'), metadata_json = ?, notes = ?
       WHERE id = ?`,
    )
    .bind(status, JSON.stringify(metadata), notes ?? null, runId)
    .run();
}

async function bootstrapManagedReferences(db: D1Database) {
  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO managed_r2_objects
       (object_key, owner_user_id, source_type, source_id, retention_status)
       SELECT avatar_key, user_id, 'profile_photo', user_id, 'active'
       FROM profiles WHERE avatar_key IS NOT NULL AND avatar_key <> ''`,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO managed_r2_objects
       (object_key, owner_user_id, source_type, source_id, retention_status)
       SELECT object_key, uploaded_by, 'project_document', id, 'active'
       FROM project_documents WHERE object_key IS NOT NULL AND object_key <> ''`,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO managed_r2_objects
       (object_key, owner_user_id, source_type, source_id, retention_status, expires_at)
       SELECT payload_reference, created_by, 'delivery_payload', id,
              CASE WHEN status = 'cancelled' THEN 'soft_deleted' ELSE 'active' END,
              datetime(created_at, '+14 days')
       FROM delivery_outbox
       WHERE channel = 'email' AND payload_reference IS NOT NULL
         AND status NOT IN ('delivered')`,
    ),
  ]);
}

async function listManagedR2Keys(bucket: R2Bucket) {
  const keys = new Set<string>();
  for (const prefix of managedPrefixes) {
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix, cursor, limit: 1000 });
      for (const object of page.objects) keys.add(object.key);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  return keys;
}

export async function runR2Inventory(env: CloudflareEnvironment) {
  await ensureOperationalResilienceSchema(env.DB);
  const runId = await startOperationalRun(env.DB, "r2_inventory");
  try {
    await bootstrapManagedReferences(env.DB);
    const [r2Keys, managedRows, findingRows] = await Promise.all([
      listManagedR2Keys(env.MEDIA),
      env.DB.prepare(
        `SELECT object_key AS objectKey, source_type AS sourceType,
                source_id AS sourceId, retention_status AS retentionStatus
         FROM managed_r2_objects`,
      ).all<{
        objectKey: string;
        sourceType: string;
        sourceId: string | null;
        retentionStatus: string;
      }>(),
      env.DB.prepare(
        `SELECT object_key AS objectKey, finding_type AS findingType
         FROM r2_inventory_findings WHERE resolved_at IS NULL`,
      ).all<{ objectKey: string; findingType: "orphan" | "missing" }>(),
    ]);

    const managed = new Map(
      managedRows.results.map((row) => [row.objectKey, row] as const),
    );
    const observedFindings = new Set<string>();
    const statements: D1PreparedStatement[] = [];
    let orphanCount = 0;
    let missingCount = 0;

    for (const key of r2Keys) {
      const row = managed.get(key);
      if (row) {
        statements.push(
          env.DB.prepare(
            `UPDATE managed_r2_objects
             SET last_verified_at = datetime('now'), updated_at = datetime('now')
             WHERE object_key = ?`,
          ).bind(key),
        );
        continue;
      }
      orphanCount += 1;
      observedFindings.add(`orphan:${key}`);
      statements.push(
        env.DB.prepare(
          `INSERT INTO r2_inventory_findings
           (object_key, finding_type, metadata_json)
           VALUES (?, 'orphan', ?)
           ON CONFLICT(object_key, finding_type) DO UPDATE SET
             last_seen_at = datetime('now'), resolved_at = NULL,
             metadata_json = excluded.metadata_json`,
        ).bind(key, JSON.stringify({ prefix: key.split("/")[0] ?? "" })),
      );
    }

    for (const row of managedRows.results) {
      if (row.retentionStatus === "deleted" || r2Keys.has(row.objectKey))
        continue;
      missingCount += 1;
      observedFindings.add(`missing:${row.objectKey}`);
      statements.push(
        env.DB.prepare(
          `INSERT INTO r2_inventory_findings
           (object_key, finding_type, source_type, source_id)
           VALUES (?, 'missing', ?, ?)
           ON CONFLICT(object_key, finding_type) DO UPDATE SET
             source_type = excluded.source_type, source_id = excluded.source_id,
             last_seen_at = datetime('now'), resolved_at = NULL`,
        ).bind(row.objectKey, row.sourceType, row.sourceId),
      );
    }

    for (const finding of findingRows.results) {
      if (observedFindings.has(`${finding.findingType}:${finding.objectKey}`))
        continue;
      statements.push(
        env.DB.prepare(
          `UPDATE r2_inventory_findings SET resolved_at = datetime('now')
           WHERE object_key = ? AND finding_type = ? AND resolved_at IS NULL`,
        ).bind(finding.objectKey, finding.findingType),
      );
    }

    if (statements.length) {
      for (let index = 0; index < statements.length; index += 100) {
        await env.DB.batch(statements.slice(index, index + 100));
      }
    }
    const metadata = {
      listedObjects: r2Keys.size,
      registeredObjects: managed.size,
      orphanCount,
      missingCount,
      prefixes: managedPrefixes,
    };
    await finishOperationalRun(env.DB, runId, "passed", metadata);
    return metadata;
  } catch (error) {
    await finishOperationalRun(
      env.DB,
      runId,
      "failed",
      {},
      sanitizeDeliveryError(error),
    );
    throw error;
  }
}

export async function runR2Cleanup(env: CloudflareEnvironment) {
  await ensureOperationalResilienceSchema(env.DB);
  const runId = await startOperationalRun(env.DB, "r2_cleanup");
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE managed_r2_objects
         SET retention_status = 'expired', updated_at = datetime('now')
         WHERE retention_status = 'active'
           AND expires_at IS NOT NULL AND expires_at <= datetime('now')`,
      ),
      env.DB.prepare(
        `UPDATE managed_r2_objects
         SET retention_status = 'soft_deleted',
             soft_deleted_at = COALESCE(soft_deleted_at, datetime('now')),
             updated_at = datetime('now')
         WHERE retention_status = 'expired'`,
      ),
    ]);
    const due = await env.DB.prepare(
      `SELECT object_key AS objectKey FROM managed_r2_objects
       WHERE retention_status = 'soft_deleted'
         AND soft_deleted_at <= datetime('now', '-7 days')
       ORDER BY soft_deleted_at LIMIT 1000`,
    ).all<{ objectKey: string }>();
    const keys = due.results.map((row) => row.objectKey);
    if (keys.length) {
      await env.MEDIA.delete(keys);
      const updates = keys.map((key) =>
        env.DB.prepare(
          `UPDATE managed_r2_objects
           SET retention_status = 'deleted', deleted_at = datetime('now'),
               updated_at = datetime('now') WHERE object_key = ?`,
        ).bind(key),
      );
      for (let index = 0; index < updates.length; index += 100) {
        await env.DB.batch(updates.slice(index, index + 100));
      }
    }
    const metadata = { deletedObjects: keys.length, graceDays: 7 };
    await finishOperationalRun(env.DB, runId, "passed", metadata);
    return metadata;
  } catch (error) {
    await finishOperationalRun(
      env.DB,
      runId,
      "failed",
      {},
      sanitizeDeliveryError(error),
    );
    throw error;
  }
}
