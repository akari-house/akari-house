import { runR2Cleanup, runR2Inventory } from "./r2-lifecycle.server";

export async function runOperationalResilienceMaintenance(
  env: CloudflareEnvironment,
) {
  const inventory = await runR2Inventory(env);
  const cleanup = await runR2Cleanup(env);
  return { inventory, cleanup };
}

export function resilienceStatus(
  lastRun: { status: string; startedAt: string } | null,
) {
  if (!lastRun) return "not_tested" as const;
  if (lastRun.status === "failed") return "attention" as const;
  const age = Date.now() - new Date(lastRun.startedAt).getTime();
  return age > 48 * 60 * 60 * 1000 ? ("stale" as const) : ("ready" as const);
}
