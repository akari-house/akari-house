from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    target = Path(path)
    content = target.read_text(encoding="utf-8")
    if old not in content:
        raise SystemExit(f"Expected text not found in {path}: {old[:120]!r}")
    target.write_text(content.replace(old, new, 1), encoding="utf-8")


replace(
    "app/routes.ts",
    '  route("__test__/personas/:persona", "routes/test-persona.ts"),\n',
    '  route("__test__/personas/:persona", "routes/test-persona.ts"),\n'
    '  route("__test__/launch-security/:action", "routes/test-launch-security.ts"),\n',
)

replace(
    "app/routes/test-persona.ts",
    '''  blocked: {
    status: "active",
    roles: ["founder"],
    membership: "approved",
    invalidateSession: true,
  },
  private_target: {''',
    '''  blocked: {
    status: "active",
    roles: ["founder"],
    membership: "approved",
    invalidateSession: true,
  },
  status_target: {
    status: "active",
    roles: ["founder"],
    membership: "approved",
  },
  private_target: {''',
)

replace(
    "app/routes/admin-moderation.tsx",
    '''  if (enforcement === "suspend_account")
    statements.push(
      db
        .prepare(
          `UPDATE users SET status = 'suspended',
         updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(report.subjectId),
    );''',
    '''  if (enforcement === "suspend_account") {
    statements.push(
      db
        .prepare(
          `UPDATE users SET status = 'suspended',
         updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(report.subjectId),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(report.subjectId),
    );
  }''',
)

replace(
    "app/routes/health.ts",
    '''    {
      status: ready ? "ready" : "degraded",
      checks: {''',
    '''    {
      status: ready ? "ready" : "degraded",
      release: "launch-completion-2026-07-26",
      checks: {''',
)

replace(
    "app/routes/admin-launch-gate.tsx",
    '''  const [rows, automated] = await Promise.all([
    env.DB.prepare(
      `SELECT check_key AS checkKey, status, environment,
              evidence_reference AS evidenceReference, notes,
              tested_at AS testedAt
       FROM launch_gate_results`,
    ).all<LaunchGateRow>(),
    env.DB.prepare(
      `SELECT e.check_key AS checkKey, e.persona,
              e.route_or_action AS routeOrAction,
              e.expected_result AS expectedResult,
              e.observed_result AS observedResult, e.status,
              r.source, r.environment, r.commit_sha AS commitSha,
              COALESCE(r.completed_at, r.started_at) AS testedAt,
              r.report_reference AS reportReference
       FROM launch_gate_evidence e
       JOIN launch_gate_runs r ON r.id = e.run_id
       WHERE e.created_at = (
         SELECT MAX(e2.created_at) FROM launch_gate_evidence e2
         WHERE e2.check_key = e.check_key
       )
       ORDER BY e.check_key`,
    ).all<AutomatedEvidenceRow>(),
  ]);

  const byKey = new Map(rows.results.map((row) => [row.checkKey, row]));
  const automatedByKey = new Map(
    automated.results.map((row) => [row.checkKey, row]),
  );
  const passed = rows.results
    .filter((row) => row.status === "passed")
    .map((row) => row.checkKey);

  return {
    user,
    checks: launchGateChecks.map(([key, description]) => ({
      key,
      description,
      result: byKey.get(key) ?? null,
      automated: automatedByKey.get(key) ?? null,
    })),
    summary: launchGateStatus(passed),
    automatedSummary: {
      covered: automated.results.filter((row) => row.status === "passed")
        .length,
      failed: automated.results.filter((row) => row.status === "failed").length,
      total: launchGateChecks.length,
    },
  };''',
    '''  const [rows, automated, latestProductionRun] = await Promise.all([
    env.DB.prepare(
      `SELECT check_key AS checkKey, status, environment,
              evidence_reference AS evidenceReference, notes,
              tested_at AS testedAt
       FROM launch_gate_results`,
    ).all<LaunchGateRow>(),
    env.DB.prepare(
      `SELECT e.check_key AS checkKey, e.persona,
              e.route_or_action AS routeOrAction,
              e.expected_result AS expectedResult,
              e.observed_result AS observedResult, e.status,
              r.source, r.environment, r.commit_sha AS commitSha,
              COALESCE(r.completed_at, r.started_at) AS testedAt,
              r.report_reference AS reportReference
       FROM launch_gate_evidence e
       JOIN launch_gate_runs r ON r.id = e.run_id
       WHERE e.created_at = (
         SELECT MAX(e2.created_at) FROM launch_gate_evidence e2
         WHERE e2.check_key = e.check_key
       )
       ORDER BY e.check_key`,
    ).all<AutomatedEvidenceRow>(),
    env.DB.prepare(
      `SELECT commit_sha AS commitSha,
              COALESCE(completed_at, started_at) AS completedAt
       FROM launch_gate_runs
       WHERE source = 'automated_production' AND status = 'passed'
       ORDER BY COALESCE(completed_at, started_at) DESC
       LIMIT 1`,
    ).first<{ commitSha: string | null; completedAt: string }>(),
  ]);

  const byKey = new Map(rows.results.map((row) => [row.checkKey, row]));
  const automatedByKey = new Map(
    automated.results.map((row) => [row.checkKey, row]),
  );
  const productionEvidenceTime = latestProductionRun?.completedAt
    ? Date.parse(latestProductionRun.completedAt)
    : 0;
  const ageCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const isStale = (row: LaunchGateRow | null | undefined) => {
    if (row?.status !== "passed" || !row.testedAt) return false;
    const testedAt = Date.parse(row.testedAt);
    return (
      Number.isFinite(testedAt) &&
      ((productionEvidenceTime > 0 && testedAt < productionEvidenceTime) ||
        testedAt < ageCutoff)
    );
  };
  const passed = rows.results
    .filter((row) => row.status === "passed" && !isStale(row))
    .map((row) => row.checkKey);

  return {
    user,
    checks: launchGateChecks.map(([key, description]) => {
      const result = byKey.get(key) ?? null;
      return {
        key,
        description,
        result,
        stale: isStale(result),
        automated: automatedByKey.get(key) ?? null,
      };
    }),
    summary: {
      ...launchGateStatus(passed),
      stale: rows.results.filter((row) => isStale(row)).length,
    },
    latestProductionRun,
    automatedSummary: {
      covered: automated.results.filter((row) => row.status === "passed")
        .length,
      failed: automated.results.filter((row) => row.status === "failed").length,
      total: launchGateChecks.length,
    },
  };''',
)

replace(
    "app/routes/admin-launch-gate.tsx",
    '''              {loaderData.summary.complete} of {loaderData.summary.total} checks
              manually approved. {loaderData.automatedSummary.covered} automated
              checks currently pass.''',
    '''              {loaderData.summary.complete} of {loaderData.summary.total} current
              production checks approved. {loaderData.summary.stale} stale.{" "}
              {loaderData.automatedSummary.covered} automated checks currently pass.''',
)

replace(
    "app/routes/admin-launch-gate.tsx",
    '''            Automated preview evidence improves coverage but does not approve a
            production launch by itself. Production checks must still be
            reviewed.''',
    '''            Automated preview evidence improves coverage but does not approve a
            production launch by itself. A newer successful production run or
            evidence older than 30 days makes prior manual approval stale.''',
)

replace(
    "app/routes/admin-launch-gate.tsx",
    '''                  {check.result?.status ?? "pending"}''',
    '''                  {check.stale ? "stale" : check.result?.status ?? "pending"}''',
)

replace(
    "app/routes/admin-launch-gate.tsx",
    '''                <p>{check.description}</p>
                {check.automated && (''',
    '''                <p>{check.description}</p>
                {check.stale && (
                  <p className="form-error">
                    Production evidence is stale and must be reviewed again.
                  </p>
                )}
                {check.automated && (''',
)

replace(
    "README.md",
    '''8. Complete `/admin/launch-gate` with evidence from real production-role journeys before broad commercial launch.
''',
    '''8. Run the manually approved **Launch Gate Production** workflow and import its reviewed JSON evidence into `/admin/launch-gate`.
9. Execute the controlled IIO pilot in `docs/operations/controlled-iio-pilot.md` before broad commercial launch.
''',
)

replace(
    "README.md",
    '''The launch-gate console records evidence; it does not replace actually executing the production-role, permission, storage, accessibility and recovery tests.
''',
    '''The launch-gate console records evidence; it does not replace actually executing the production-role, permission, storage, accessibility and recovery tests. Production evidence expires after 30 days or when superseded by a newer successful production run. See `docs/operations/production-launch-audit.md`.
''',
)
