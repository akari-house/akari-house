import { Form, Link } from "react-router";
import type { Route } from "./+types/admin-launch-gate";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  launchGateEvidenceLabel,
  launchGateEvidenceSources,
  type LaunchGateEvidenceSource,
} from "~/lib/launch-gate-evidence";
import { launchGateChecks, launchGateStatus } from "~/lib/launch-gate";
import { ensureLaunchGateSchema } from "~/lib/launch-gate-schema.server";
import { requireSuperAdmin } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type LaunchGateRow = {
  checkKey: string;
  status: string;
  environment: string;
  evidenceReference: string | null;
  notes: string | null;
  testedAt: string | null;
};

type AutomatedEvidenceRow = {
  checkKey: string;
  persona: string;
  routeOrAction: string;
  expectedResult: string;
  observedResult: string;
  status: "passed" | "failed" | "skipped";
  source: LaunchGateEvidenceSource;
  environment: string;
  commitSha: string | null;
  testedAt: string;
  reportReference: string | null;
};

type ImportedReport = {
  source: LaunchGateEvidenceSource;
  environment: string;
  commitSha?: string | null;
  generatedAt: string;
  status: "passed" | "failed";
  checks: Array<{
    checkKey: string;
    persona: string;
    routeOrAction: string;
    expectedResult: string;
    observedResult: string;
    status: "passed" | "failed" | "skipped";
    traceReference?: string | null;
  }>;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  await ensureLaunchGateSchema(env.DB);

  const [rows, automated] = await Promise.all([
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
  };
}

function parseImportedReport(value: string): ImportedReport | null {
  try {
    const report = JSON.parse(value) as ImportedReport;
    if (
      !launchGateEvidenceSources.includes(report.source) ||
      report.source === "manual_production" ||
      !report.environment ||
      !report.generatedAt ||
      !["passed", "failed"].includes(report.status) ||
      !Array.isArray(report.checks)
    )
      return null;
    return report;
  } catch {
    return null;
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  await ensureLaunchGateSchema(env.DB);

  const form = await request.formData();
  const intent = formText(form.get("intent")) || "manual";
  const allowed = new Set(launchGateChecks.map(([key]) => key));

  if (intent === "import-report") {
    const report = parseImportedReport(formText(form.get("reportJson")));
    if (!report)
      return { error: "Choose a valid automated launch-gate report." };
    if (
      report.checks.some(
        (check) =>
          !allowed.has(
            check.checkKey as (typeof launchGateChecks)[number][0],
          ) || !["passed", "failed", "skipped"].includes(check.status),
      )
    )
      return { error: "The report contains an unknown launch-gate check." };

    const runId = crypto.randomUUID();
    const reportReference = formText(form.get("reportReference")).slice(0, 500);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO launch_gate_runs
           (id, source, environment, commit_sha, status, report_reference,
            started_at, completed_at, reviewed_by, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).bind(
        runId,
        report.source,
        report.environment.slice(0, 120),
        report.commitSha?.slice(0, 80) || null,
        report.status,
        reportReference || null,
        report.generatedAt,
        report.generatedAt,
        user.id,
      ),
      ...report.checks.map((check) =>
        env.DB.prepare(
          `INSERT INTO launch_gate_evidence
             (id, run_id, check_key, persona, route_or_action,
              expected_result, observed_result, status, trace_reference)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          runId,
          check.checkKey,
          check.persona.slice(0, 120),
          check.routeOrAction.slice(0, 500),
          check.expectedResult.slice(0, 1000),
          check.observedResult.slice(0, 1000),
          check.status,
          check.traceReference?.slice(0, 500) || null,
        ),
      ),
    ]);
    return { imported: report.checks.length };
  }

  const checkKey = formText(form.get("checkKey"));
  const status = formText(form.get("status"));
  const environment = formText(form.get("environment")) || "production";
  const evidenceReference = formText(form.get("evidenceReference"));
  const notes = formText(form.get("notes"));

  if (
    !allowed.has(checkKey as (typeof launchGateChecks)[number][0]) ||
    !["pending", "passed", "failed", "waived"].includes(status)
  )
    throw new Response("Invalid launch-gate result", { status: 400 });

  if (status === "passed" && evidenceReference.trim().length < 3)
    return { error: "Passed checks require an evidence reference." };

  await env.DB.prepare(
    `INSERT INTO launch_gate_results
      (check_key, status, environment, evidence_reference, notes,
       tested_by, tested_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(check_key) DO UPDATE SET
       status = excluded.status,
       environment = excluded.environment,
       evidence_reference = excluded.evidence_reference,
       notes = excluded.notes,
       tested_by = excluded.tested_by,
       tested_at = datetime('now'),
       updated_at = datetime('now')`,
  )
    .bind(
      checkKey,
      status,
      environment.slice(0, 80),
      evidenceReference.slice(0, 500) || null,
      notes.slice(0, 4000) || null,
      user.id,
    )
    .run();

  return { saved: true };
}

export default function AdminLaunchGate({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Commercial launch gate</span>
            <h1>Real-role permission testing</h1>
            <p>
              {loaderData.summary.complete} of {loaderData.summary.total} checks
              manually approved. {loaderData.automatedSummary.covered} automated
              checks currently pass.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin/operations">
            Command centre
          </Link>
        </header>

        {actionData?.saved && (
          <p className="notice success">Launch-gate evidence saved.</p>
        )}
        {actionData?.imported && (
          <p className="notice success">
            Imported {actionData.imported} automated evidence records.
          </p>
        )}
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <section
          className={
            loaderData.summary.ready
              ? "notice success"
              : "notice applicant-notice"
          }
          aria-live="polite"
        >
          <strong>
            {loaderData.summary.ready
              ? "Launch gate passed"
              : "Launch remains blocked"}
          </strong>
          <p>
            Automated preview evidence improves coverage but does not approve a
            production launch by itself. Production checks must still be
            reviewed.
          </p>
        </section>

        <section
          className="admin-panel"
          aria-labelledby="automated-evidence-title"
        >
          <span className="chapter">Automated evidence</span>
          <h2 id="automated-evidence-title">Import a reviewed CI report</h2>
          <p>
            Download the JSON artifact from the Launch Gate Preview workflow,
            review it, then import it here. Imported preview evidence is shown
            separately from production approval.
          </p>
          <Form method="post" className="form-stack">
            <input type="hidden" name="intent" value="import-report" />
            <label>
              Artifact or workflow reference
              <input
                name="reportReference"
                maxLength={500}
                placeholder="GitHub Actions run or artifact reference"
              />
            </label>
            <label>
              Machine-readable report JSON
              <textarea name="reportJson" rows={10} required />
            </label>
            <button className="button button-primary" type="submit">
              Import reviewed report
            </button>
          </Form>
        </section>

        <div className="application-list">
          {loaderData.checks.map((check) => (
            <article className="application-card" key={check.key}>
              <div>
                <span className="chapter">
                  {check.result?.status ?? "pending"}
                </span>
                <h2>{check.key.replaceAll("_", " ")}</h2>
                <p>{check.description}</p>
                {check.automated && (
                  <div className="status-card">
                    <strong>
                      {launchGateEvidenceLabel(check.automated.source)} ·{" "}
                      {check.automated.status}
                    </strong>
                    <p>{check.automated.routeOrAction}</p>
                    <p>
                      {check.automated.environment}
                      {check.automated.commitSha
                        ? ` · ${check.automated.commitSha.slice(0, 12)}`
                        : ""}
                    </p>
                    {check.automated.reportReference && (
                      <p>Report: {check.automated.reportReference}</p>
                    )}
                  </div>
                )}
                {check.result?.evidenceReference && (
                  <p>Production evidence: {check.result.evidenceReference}</p>
                )}
              </div>
              <Form method="post" className="form-stack">
                <input type="hidden" name="intent" value="manual" />
                <input type="hidden" name="checkKey" value={check.key} />
                <label>
                  Production review status
                  <select
                    name="status"
                    defaultValue={check.result?.status ?? "pending"}
                  >
                    <option value="pending">Pending</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                    <option value="waived">Waived</option>
                  </select>
                </label>
                <label>
                  Environment
                  <input
                    name="environment"
                    maxLength={80}
                    defaultValue={check.result?.environment ?? "production"}
                  />
                </label>
                <label>
                  Evidence reference
                  <input
                    name="evidenceReference"
                    maxLength={500}
                    defaultValue={check.result?.evidenceReference ?? ""}
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    name="notes"
                    maxLength={4000}
                    defaultValue={check.result?.notes ?? ""}
                  />
                </label>
                <button className="button button-primary" type="submit">
                  Save production review
                </button>
              </Form>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
