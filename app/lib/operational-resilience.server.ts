import { ensureOperationalResilienceSchema } from "./operational-resilience-schema.server";

export async function runOperationalResilienceMaintenance(
  env: CloudflareEnvironment,
) {
  await ensureOperationalResilienceSchema(env.DB);
  const runId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO operational_runs (id, run_type, status, metadata_json)
     VALUES (?, 'r2_inventory', 'running', '{}')`,
  )
    .bind(runId)
    .run();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE managed_r2_objects
         SET retention_status = 'expired', updated_at = datetime('now')
         WHERE retention_status = 'active'
           AND expires_at IS NOT NULL
           AND expires_at <= datetime('now')`,
      ),
      env.DB.prepare(
        `UPDATE managed_r2_objects
         SET retention_status = 'soft_deleted',
             soft_deleted_at = COALESCE(soft_deleted_at, datetime('now')),
             updated_at = datetime('now')
         WHERE retention_status = 'expired'`,
      ),
      env.DB.prepare(
        `UPDATE operational_runs
         SET status = 'passed', completed_at = datetime('now')
         WHERE id = ?`,
      ).bind(runId),
    ]);
  } catch (error) {
    await env.DB.prepare(
      `UPDATE operational_runs
       SET status = 'failed', completed_at = datetime('now'), notes = ?
       WHERE id = ?`,
    )
      .bind(
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Unknown failure",
        runId,
      )
      .run();
    throw error;
  }
}

export function resilienceStatus(
  lastRun: { status: string; startedAt: string } | null,
) {
  if (!lastRun) return "not_tested" as const;
  if (lastRun.status === "failed") return "attention" as const;
  const age = Date.now() - new Date(lastRun.startedAt).getTime();
  return age > 48 * 60 * 60 * 1000 ? ("stale" as const) : ("ready" as const);
}
