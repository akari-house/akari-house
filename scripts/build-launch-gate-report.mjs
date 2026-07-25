import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const input = process.argv[2] ?? "test-results/launch-gate-playwright.json";
const output = process.argv[3] ?? "test-results/launch-gate-report.json";
const raw = JSON.parse(await readFile(input, "utf8"));
const evidence = [];

function visitSuite(suite) {
  for (const spec of suite.specs ?? []) {
    const match = /^\[([^:]+):([^\]]+)\]\s+(.+)$/.exec(spec.title);
    if (!match) continue;
    const [, checkKey, persona, routeOrAction] = match;
    for (const test of spec.tests ?? []) {
      const result = test.results?.at(-1);
      evidence.push({
        checkKey,
        persona,
        routeOrAction,
        expectedResult: "Playwright assertions pass",
        observedResult:
          result?.error?.message?.split("\n")[0] ?? result?.status ?? "unknown",
        status:
          result?.status === "passed"
            ? "passed"
            : result?.status === "skipped"
              ? "skipped"
              : "failed",
        project: test.projectName ?? "unknown",
        traceReference:
          result?.attachments?.find((attachment) => attachment.name === "trace")
            ?.path ?? null,
      });
    }
  }
  for (const child of suite.suites ?? []) visitSuite(child);
}

for (const suite of raw.suites ?? []) visitSuite(suite);

const priority = { failed: 3, passed: 2, skipped: 1 };
const consolidated = new Map();
for (const item of evidence) {
  const existing = consolidated.get(item.checkKey);
  if (!existing || priority[item.status] > priority[existing.status])
    consolidated.set(item.checkKey, item);
}
const checks = [...consolidated.values()].sort((left, right) =>
  left.checkKey.localeCompare(right.checkKey),
);
const report = {
  schemaVersion: 1,
  source: process.env.LAUNCH_GATE_SOURCE ?? "automated_preview",
  environment: process.env.LAUNCH_GATE_ENV ?? "local-ci",
  commitSha: process.env.GITHUB_SHA ?? null,
  generatedAt: new Date().toISOString(),
  status: checks.some((check) => check.status === "failed")
    ? "failed"
    : "passed",
  totalChecks: checks.length,
  passedChecks: checks.filter((check) => check.status === "passed").length,
  failedChecks: checks.filter((check) => check.status === "failed").length,
  skippedChecks: checks.filter((check) => check.status === "skipped").length,
  checks,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `Launch gate: ${report.passedChecks}/${report.totalChecks} passed, ${report.failedChecks} failed.\n`,
);
if (report.status === "failed") process.exitCode = 1;
