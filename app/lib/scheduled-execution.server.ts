import {
  deliveryErrorCategory,
  sanitizeDeliveryError,
} from "./delivery-policy";
import { ensureDeliveryOperationsSchema } from "./delivery-operations-schema.server";

export async function executeScheduledPlan<JobName extends string>(
  env: CloudflareEnvironment,
  cron: string,
  jobs: readonly JobName[],
  runJob: (job: JobName) => Promise<unknown>,
) {
  await ensureDeliveryOperationsSchema(env.DB);
  const invocationId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO scheduled_invocations
     (id, cron, correlation_id, status)
     VALUES (?, ?, ?, 'running')`,
  )
    .bind(invocationId, cron.slice(0, 100), correlationId)
    .run();

  let passed = 0;
  let failed = 0;
  for (const job of jobs) {
    const runId = crypto.randomUUID();
    const started = Date.now();
    await env.DB.prepare(
      `INSERT INTO scheduled_job_runs
       (id, invocation_id, job_name, status)
       VALUES (?, ?, ?, 'running')`,
    )
      .bind(runId, invocationId, job)
      .run();
    try {
      await runJob(job);
      passed += 1;
      await env.DB.prepare(
        `UPDATE scheduled_job_runs
         SET status = 'passed', duration_ms = ?, completed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(Date.now() - started, runId)
        .run();
    } catch (error) {
      failed += 1;
      await env.DB.prepare(
        `UPDATE scheduled_job_runs
         SET status = 'failed', duration_ms = ?, error_category = ?,
             last_error = ?, completed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(
          Date.now() - started,
          deliveryErrorCategory(error),
          sanitizeDeliveryError(error),
          runId,
        )
        .run();
      console.error(
        JSON.stringify({
          event: "scheduled_job_failed",
          correlationId,
          job,
          error: sanitizeDeliveryError(error),
        }),
      );
    }
  }

  const status =
    failed === 0 ? "passed" : passed === 0 ? "failed" : "partial";
  await env.DB.prepare(
    `UPDATE scheduled_invocations
     SET status = ?, completed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(status, invocationId)
    .run();
  console.log(
    JSON.stringify({
      event: "scheduled_invocation_completed",
      correlationId,
      cron,
      status,
      passed,
      failed,
    }),
  );
  return { invocationId, correlationId, status, passed, failed };
}
