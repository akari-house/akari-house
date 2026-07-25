import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [productionPath, restoredPath, integrityPath, evidencePath, sqlPath] =
  process.argv.slice(2);
if (!productionPath || !restoredPath || !integrityPath || !evidencePath || !sqlPath)
  throw new Error(
    "Usage: node validate-restore.mjs <production.json> <restored.json> <integrity.json> <evidence.json> <evidence.sql>",
  );

function parse(path) {
  return readFile(path, "utf8").then((value) => JSON.parse(value));
}

function findRows(value, predicate) {
  const matches = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      if (node.every((item) => item && typeof item === "object") && predicate(node))
        matches.push(node);
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const child of Object.values(node)) visit(child);
  };
  visit(value);
  return matches.at(-1) ?? [];
}

function countMap(payload) {
  const rows = findRows(
    payload,
    (items) =>
      items.length > 0 &&
      items.every(
        (item) =>
          "tableName" in item &&
          ("rowCount" in item || "row_count" in item),
      ),
  );
  return Object.fromEntries(
    rows.map((row) => [
      String(row.tableName),
      Number(row.rowCount ?? row.row_count),
    ]),
  );
}

function integrityValue(payload) {
  const rows = findRows(
    payload,
    (items) =>
      items.length > 0 &&
      items.some((item) =>
        Object.keys(item).some((key) => key.toLowerCase().includes("integrity")),
      ),
  );
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (key.toLowerCase().includes("integrity")) return String(value);
    }
  }
  return "missing";
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const [productionPayload, restoredPayload, integrityPayload] = await Promise.all([
  parse(productionPath),
  parse(restoredPath),
  parse(integrityPath),
]);
const productionCounts = countMap(productionPayload);
const restoredCounts = countMap(restoredPayload);
const requiredTables = ["users", "projects", "ambassador_campaigns", "audit_logs"];
for (const table of requiredTables) {
  if (!(table in productionCounts) || !(table in restoredCounts))
    throw new Error(`Recovery evidence is missing the ${table} count.`);
  if (productionCounts[table] !== restoredCounts[table])
    throw new Error(
      `Restored ${table} count ${restoredCounts[table]} does not match production ${productionCounts[table]}.`,
    );
}
const integrity = integrityValue(integrityPayload).toLowerCase();
if (integrity !== "ok")
  throw new Error(`Restored D1 integrity check returned ${integrity}.`);

const timestamp = process.env.RECOVERY_TIMESTAMP;
const backupKey = process.env.RECOVERY_BACKUP_KEY;
const backupSha256 = process.env.RECOVERY_BACKUP_SHA256;
const workflowUrl = process.env.RECOVERY_WORKFLOW_URL;
const temporaryDatabaseId = process.env.RECOVERY_TEMP_DATABASE_ID;
if (!timestamp || !backupKey || !backupSha256 || !workflowUrl || !temporaryDatabaseId)
  throw new Error("Recovery evidence environment is incomplete.");

const evidence = {
  version: 1,
  timestamp,
  backupKey,
  backupSha256,
  workflowUrl,
  temporaryDatabaseId,
  integrity: "ok",
  productionCounts,
  restoredCounts,
  result: "passed",
};
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

const metadata = JSON.stringify(evidence);
const backupRunId = randomUUID();
const restoreRunId = randomUUID();
const sourceId = createHash("sha256").update(backupSha256).digest("hex");
const statements = [
  `INSERT INTO managed_r2_objects
   (object_key, source_type, source_id, retention_status, expires_at, last_verified_at)
   VALUES (${sqlLiteral(backupKey)}, 'd1_backup', ${sqlLiteral(sourceId)}, 'active', datetime('now', '+30 days'), datetime('now'))
   ON CONFLICT(object_key) DO UPDATE SET
     source_type = excluded.source_type, source_id = excluded.source_id,
     retention_status = 'active', expires_at = excluded.expires_at,
     last_verified_at = datetime('now'), deleted_at = NULL, soft_deleted_at = NULL,
     updated_at = datetime('now');`,
  `INSERT INTO operational_runs
   (id, run_type, status, completed_at, evidence_reference, notes, metadata_json)
   VALUES (${sqlLiteral(backupRunId)}, 'd1_backup', 'passed', datetime('now'),
     ${sqlLiteral(backupKey)}, 'Encrypted D1 backup created and retained in private R2.',
     ${sqlLiteral(metadata)});`,
  `INSERT INTO operational_runs
   (id, run_type, status, completed_at, evidence_reference, notes, metadata_json)
   VALUES (${sqlLiteral(restoreRunId)}, 'd1_restore_test', 'passed', datetime('now'),
     ${sqlLiteral(workflowUrl)}, 'Backup restored into an isolated D1 database and integrity-checked.',
     ${sqlLiteral(metadata)});`,
];
await writeFile(sqlPath, `${statements.join("\n")}\n`);
