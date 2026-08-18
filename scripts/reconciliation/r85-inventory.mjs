import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

function flattenRows(payload) {
  const containers = Array.isArray(payload) ? payload : [payload];
  const rows = [];
  for (const container of containers) {
    const results = Array.isArray(container?.result)
      ? container.result
      : Array.isArray(container?.results)
        ? [{ results: container.results }]
        : Array.isArray(container?.result?.results)
          ? [{ results: container.result.results }]
          : [];
    for (const result of results) {
      if (Array.isArray(result?.results)) rows.push(...result.results);
    }
  }
  return rows;
}

function metricMap(payload) {
  const metrics = {};
  for (const row of flattenRows(payload)) {
    if (typeof row?.metric !== "string") continue;
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    metrics[row.metric] = value;
  }
  return metrics;
}

function selectTenant(payload) {
  const rows = flattenRows(payload).filter(
    (row) => typeof row?.id === "string" && row.id.length > 0,
  );
  if (rows.length === 1) {
    return { status: "unique", tenantId: rows[0].id };
  }
  return {
    status: rows.length === 0 ? "missing" : "ambiguous",
    tenantId: null,
    candidateCount: rows.length,
  };
}

function sqlLiteral(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function selectTenantCommand(inputPath, outputPath) {
  const payload = JSON.parse(await readFile(inputPath, "utf8"));
  await writeFile(
    outputPath,
    `${JSON.stringify(selectTenant(payload), null, 2)}\n`,
  );
}

async function prepareCrmSqlCommand(sourcePath, tenantPath, outputPath) {
  const tenant = JSON.parse(await readFile(tenantPath, "utf8"));
  if (tenant.status !== "unique" || !tenant.tenantId) {
    throw new Error(
      "CRM inventory SQL requires one explicitly selected tenant.",
    );
  }
  const source = await readFile(sourcePath, "utf8");
  if (!source.includes(":tenant_id")) {
    throw new Error(
      "CRM inventory SQL does not contain the tenant placeholder.",
    );
  }
  await writeFile(
    outputPath,
    source.replaceAll(":tenant_id", sqlLiteral(tenant.tenantId)),
  );
}

async function finalizeCommand(
  housePath,
  crmPath,
  tenantPath,
  backupPath,
  auditPath,
  statusPath,
) {
  const house = metricMap(JSON.parse(await readFile(housePath, "utf8")));
  const crmPayload = JSON.parse(await readFile(crmPath, "utf8"));
  const crm = crmPayload.skipped ? {} : metricMap(crmPayload);
  const tenant = JSON.parse(await readFile(tenantPath, "utf8"));
  const backups = JSON.parse(await readFile(backupPath, "utf8"));
  const runId = randomUUID();
  const completedAt = new Date().toISOString();
  const metadata = {
    phase: "R85",
    kind: "count_only_reconciliation_inventory",
    bridgeMode: "legacy",
    mappingWrites: 0,
    tenantResolution: tenant.status,
    tenantCandidateCount: tenant.candidateCount ?? (tenant.tenantId ? 1 : 0),
    crmTenantId: tenant.tenantId ?? null,
    houseMetrics: house,
    crmMetrics: crm,
    backups,
    completedAt,
  };
  const sql = `INSERT INTO audit_logs\n  (id, actor_user_id, action, subject_type, subject_id, metadata_json, created_at)\nVALUES (\n  ${sqlLiteral(randomUUID())},\n  NULL,\n  'r85.crm_reconciliation_inventory',\n  'crm_reconciliation',\n  ${sqlLiteral(runId)},\n  ${sqlLiteral(JSON.stringify(metadata))},\n  ${sqlLiteral(completedAt)}\n);\n`;
  await writeFile(auditPath, sql);
  await writeFile(
    statusPath,
    `${JSON.stringify(
      {
        status: "completed",
        privateRecordId: runId,
        tenantResolution: tenant.status,
        bridgeMode: "legacy",
        mappingWrites: 0,
        backupLocation: "encrypted-r2",
      },
      null,
      2,
    )}\n`,
  );
}

const [command, ...args] = process.argv.slice(2);
if (command === "select-tenant" && args.length === 2) {
  await selectTenantCommand(...args);
} else if (command === "prepare-crm-sql" && args.length === 3) {
  await prepareCrmSqlCommand(...args);
} else if (command === "finalize" && args.length === 6) {
  await finalizeCommand(...args);
} else {
  throw new Error(
    "Usage: r85-inventory.mjs select-tenant <input.json> <output.json> | prepare-crm-sql <source.sql> <tenant.json> <output.sql> | finalize <house.json> <crm.json> <tenant.json> <backups.json> <audit.sql> <status.json>",
  );
}
