import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const database = process.env.AKARI_D1_DATABASE || "akari-house-db";
const output =
  process.env.INVENTORY_REPORT_PATH ||
  "production-performance/production-inventory.json";
const evidenceCommitSha =
  process.env.AKARI_EVIDENCE_COMMIT_SHA || process.env.GITHUB_SHA || null;

const queries = {
  publishedProjects:
    "SELECT COUNT(*) AS count FROM projects WHERE status = 'published'",
  publishedOpportunities:
    "SELECT COUNT(*) AS count FROM opportunity_listings WHERE status = 'published'",
  publishedCampaigns:
    "SELECT COUNT(*) AS count FROM ambassador_campaigns WHERE status = 'published'",
  upcomingEvents:
    "SELECT COUNT(*) AS count FROM events WHERE status = 'published' AND starts_at >= datetime('now')",
  approvedFounders:
    "SELECT COUNT(DISTINCT u.id) AS count FROM users u JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved' JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'founder' WHERE u.status = 'active'",
  approvedCreators:
    "SELECT COUNT(DISTINCT u.id) AS count FROM users u JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved' JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'creator' WHERE u.status = 'active'",
  approvedInvestors:
    "SELECT COUNT(DISTINCT u.id) AS count FROM users u JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved' JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'investor' WHERE u.status = 'active'",
  multiRoleMembers:
    "SELECT COUNT(*) AS count FROM (SELECT u.id FROM users u JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved' JOIN user_roles ur ON ur.user_id = u.id WHERE u.status = 'active' GROUP BY u.id HAVING COUNT(DISTINCT ur.role) > 1)",
  pilotParticipants:
    "SELECT COUNT(*) AS count FROM pilot_participants pp JOIN pilot_cohorts pc ON pc.id = pp.cohort_id WHERE pc.id = (SELECT id FROM pilot_cohorts ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, updated_at DESC LIMIT 1) AND pp.status <> 'withdrawn'",
  completedParticipants:
    "SELECT COUNT(*) AS count FROM pilot_participants pp JOIN pilot_cohorts pc ON pc.id = pp.cohort_id WHERE pc.id = (SELECT id FROM pilot_cohorts ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, updated_at DESC LIMIT 1) AND pp.status = 'completed'",
  pilotFounders:
    "SELECT COUNT(DISTINCT pp.user_id) AS count FROM pilot_participants pp JOIN user_roles ur ON ur.user_id = pp.user_id AND ur.role = 'founder' WHERE pp.cohort_id = (SELECT id FROM pilot_cohorts ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, updated_at DESC LIMIT 1) AND pp.status <> 'withdrawn'",
  pilotCreators:
    "SELECT COUNT(DISTINCT pp.user_id) AS count FROM pilot_participants pp JOIN user_roles ur ON ur.user_id = pp.user_id AND ur.role = 'creator' WHERE pp.cohort_id = (SELECT id FROM pilot_cohorts ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, updated_at DESC LIMIT 1) AND pp.status <> 'withdrawn'",
  pilotInvestors:
    "SELECT COUNT(DISTINCT pp.user_id) AS count FROM pilot_participants pp JOIN user_roles ur ON ur.user_id = pp.user_id AND ur.role = 'investor' WHERE pp.cohort_id = (SELECT id FROM pilot_cohorts ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, updated_at DESC LIMIT 1) AND pp.status <> 'withdrawn'",
  pilotMultiRole:
    "SELECT COUNT(*) AS count FROM (SELECT pp.user_id FROM pilot_participants pp JOIN user_roles ur ON ur.user_id = pp.user_id WHERE pp.cohort_id = (SELECT id FROM pilot_cohorts ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, updated_at DESC LIMIT 1) AND pp.status <> 'withdrawn' GROUP BY pp.user_id HAVING COUNT(DISTINCT ur.role) > 1)",
  openCriticalOrHighFindings:
    "SELECT COUNT(*) AS count FROM pilot_findings WHERE cohort_id = (SELECT id FROM pilot_cohorts ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, updated_at DESC LIMIT 1) AND status <> 'resolved' AND severity IN ('critical','high')",
};

function queryCount(sql) {
  const stdout = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      database,
      "--remote",
      "--json",
      "--command",
      sql,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const payload = JSON.parse(stdout);
  const blocks = Array.isArray(payload) ? payload : [payload];
  for (const block of blocks) {
    const rows = block?.results ?? block?.result?.results ?? [];
    const value = rows?.[0]?.count;
    if (value !== undefined && value !== null) return Number(value);
  }
  return 0;
}

const counts = Object.fromEntries(
  Object.entries(queries).map(([key, sql]) => [key, queryCount(sql)]),
);

const thresholds = {
  publishedProjects: 3,
  publishedOpportunities: 2,
  publishedCampaigns: 1,
  upcomingEvents: 2,
  approvedFounders: 3,
  approvedCreators: 8,
  approvedInvestors: 3,
  multiRoleMembers: 1,
  pilotParticipants: 10,
  completedParticipants: 10,
  pilotFounders: 3,
  pilotCreators: 8,
  pilotInvestors: 3,
  pilotMultiRole: 1,
  openCriticalOrHighFindings: 0,
};

const checks = Object.entries(thresholds).map(([key, target]) => ({
  key,
  current: counts[key] ?? 0,
  target,
  passed:
    key === "openCriticalOrHighFindings"
      ? (counts[key] ?? 0) === 0
      : (counts[key] ?? 0) >= target,
}));

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha: evidenceCommitSha,
  database,
  privacy:
    "Aggregate counts only. No member identity, email, profile content, financial value or document content is exported.",
  counts,
  thresholds,
  checks,
  seedAndCohortThresholdsPassed: checks.every((check) => check.passed),
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
