import { Form, Link } from "react-router";
import type { Route } from "./+types/admin-production";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import { ensureProductionPilotSchema } from "~/lib/production-pilot-schema.server";
import {
  evaluateProductionReadiness,
  productionCheckDefinitions,
  type PilotState,
  type ProductionCheckRecord,
  type ProductionCheckStatus,
  type PublicAuditRecord,
} from "~/lib/production-readiness";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type AuditRunRow = {
  id: string;
  commitSha: string | null;
  status: "passed" | "failed";
  checksJson: string;
  workflowUrl: string | null;
  completedAt: string;
};

type CheckRow = ProductionCheckRecord & {
  evidenceReference: string | null;
  notes: string | null;
};

type PilotRow = {
  id: string;
  name: string;
  stage: NonNullable<PilotState>["stage"];
  status: NonNullable<PilotState>["status"];
  targetSize: number;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type FindingRow = {
  id: string;
  cohortId: string;
  severity: "critical" | "high" | "medium" | "low";
  area: string;
  summary: string;
  status: "open" | "reviewing" | "resolved";
  owner: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

const checkKeys = new Set(productionCheckDefinitions.map((check) => check.key));
const checkStatuses = new Set<ProductionCheckStatus>([
  "pending",
  "passed",
  "failed",
  "not_applicable",
]);
const pilotStages = new Set<NonNullable<PilotState>["stage"]>([
  "internal",
  "invited_15",
  "invited_25",
  "invited_50",
  "invited_100",
]);
const pilotStatuses = new Set<NonNullable<PilotState>["status"]>([
  "planning",
  "active",
  "paused",
  "completed",
]);
const findingSeverities = new Set(["critical", "high", "medium", "low"]);

function parseAuditChecks(value: string) {
  try {
    const parsed = JSON.parse(value) as Array<{
      key?: string;
      label?: string;
      status?: string;
      detail?: string;
    }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("en-GB");
}

async function writeAudit(
  db: D1Database,
  actorUserId: string,
  action: string,
  subjectType: string,
  subjectId: string | null,
  metadata: Record<string, unknown>,
) {
  await db
    .prepare(
      `INSERT INTO audit_logs
        (id, actor_user_id, action, subject_type, subject_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorUserId,
      action,
      subjectType,
      subjectId,
      JSON.stringify(metadata),
    )
    .run();
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  await ensureProductionPilotSchema(env.DB);

  const [latestAudit, checks, pilots, findings] = await Promise.all([
    env.DB.prepare(
      `SELECT id, commit_sha AS commitSha, status, checks_json AS checksJson,
              workflow_url AS workflowUrl, completed_at AS completedAt
       FROM production_audit_runs
       ORDER BY completed_at DESC
       LIMIT 1`,
    ).first<AuditRunRow>(),
    env.DB.prepare(
      `SELECT check_key AS checkKey, status,
              evidence_reference AS evidenceReference, notes,
              reviewed_at AS reviewedAt, expires_at AS expiresAt
       FROM production_readiness_checks
       ORDER BY check_key`,
    ).all<CheckRow>(),
    env.DB.prepare(
      `SELECT id, name, stage, status, target_size AS targetSize, notes,
              started_at AS startedAt, completed_at AS completedAt,
              created_at AS createdAt
       FROM pilot_cohorts
       ORDER BY updated_at DESC
       LIMIT 12`,
    ).all<PilotRow>(),
    env.DB.prepare(
      `SELECT id, cohort_id AS cohortId, severity, area, summary, status,
              owner, resolution_notes AS resolutionNotes,
              created_at AS createdAt, resolved_at AS resolvedAt
       FROM pilot_findings
       ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
                CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                  WHEN 'medium' THEN 2 ELSE 3 END,
                created_at DESC
       LIMIT 100`,
    ).all<FindingRow>(),
  ]);

  const activePilot =
    pilots.results.find((pilot) => pilot.status !== "completed") ??
    pilots.results[0] ??
    null;
  const unresolved = findings.results.filter(
    (finding) => finding.status !== "resolved",
  );
  const criticalFindings = unresolved.filter((finding) =>
    ["critical", "high"].includes(finding.severity),
  ).length;
  const publicAudit: PublicAuditRecord = latestAudit
    ? {
        status: latestAudit.status,
        completedAt: latestAudit.completedAt,
        commitSha: latestAudit.commitSha,
      }
    : null;
  const readiness = evaluateProductionReadiness({
    publicAudit,
    manualChecks: checks.results,
    criticalFindings,
    unresolvedFindings: unresolved.length,
    pilot: activePilot
      ? { status: activePilot.status, stage: activePilot.stage }
      : null,
  });
  const telegramEnv = env as typeof env & {
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_WEBHOOK_SECRET?: string;
  };

  return {
    user,
    latestAudit: latestAudit
      ? { ...latestAudit, checks: parseAuditChecks(latestAudit.checksJson) }
      : null,
    readiness,
    checks: readiness.manual,
    pilots: pilots.results,
    activePilot,
    findings: findings.results,
    unresolvedFindings: unresolved.length,
    criticalFindings,
    integrations: [
      { label: "D1 production database", ready: true },
      { label: "R2 private media", ready: Boolean(env.MEDIA) },
      {
        label: "Transactional email configuration",
        ready: Boolean(env.RESEND_API_KEY && env.MEMBERSHIP_FROM_EMAIL),
      },
      {
        label: "Turnstile production configuration",
        ready: Boolean(
          env.TURNSTILE_SITE_KEY &&
          env.TURNSTILE_SECRET_KEY &&
          env.TURNSTILE_HOSTNAME === "akarihouse.com",
        ),
      },
      {
        label: "Google OAuth and export configuration",
        ready: Boolean(
          env.GOOGLE_CLIENT_ID &&
          env.GOOGLE_CLIENT_SECRET &&
          env.GOOGLE_TOKEN_ENCRYPTION_KEY,
        ),
      },
      {
        label: "Telegram delivery configuration",
        ready: Boolean(
          telegramEnv.TELEGRAM_BOT_TOKEN && telegramEnv.TELEGRAM_WEBHOOK_SECRET,
        ),
      },
    ],
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  await ensureProductionPilotSchema(env.DB);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "save-check") {
    const checkKey = formText(form.get("checkKey"));
    const status = formText(form.get("status")) as ProductionCheckStatus;
    const evidenceReference = formText(form.get("evidenceReference")).slice(
      0,
      500,
    );
    const notes = formText(form.get("notes")).slice(0, 4000);
    if (!checkKeys.has(checkKey as never) || !checkStatuses.has(status))
      throw new Response("Invalid production check", { status: 400 });
    if (status === "passed" && evidenceReference.length < 3)
      return { error: "Passed checks require an evidence reference." };

    await env.DB.prepare(
      `INSERT INTO production_readiness_checks
        (check_key, status, evidence_reference, notes, reviewed_by,
         reviewed_at, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'),
         CASE WHEN ? = 'passed' THEN datetime('now', '+30 days') ELSE NULL END,
         datetime('now'))
       ON CONFLICT(check_key) DO UPDATE SET
         status = excluded.status,
         evidence_reference = excluded.evidence_reference,
         notes = excluded.notes,
         reviewed_by = excluded.reviewed_by,
         reviewed_at = datetime('now'),
         expires_at = CASE WHEN excluded.status = 'passed'
           THEN datetime('now', '+30 days') ELSE NULL END,
         updated_at = datetime('now')`,
    )
      .bind(
        checkKey,
        status,
        evidenceReference || null,
        notes || null,
        user.id,
        status,
      )
      .run();
    await writeAudit(
      env.DB,
      user.id,
      "production.check.reviewed",
      "production_check",
      checkKey,
      {
        status,
        evidenceReference: evidenceReference || null,
      },
    );
    return { saved: "Production evidence updated." };
  }

  if (intent === "create-pilot") {
    const name = formText(form.get("name")).slice(0, 160);
    const targetSize = Number(formText(form.get("targetSize")) || "15");
    const notes = formText(form.get("notes")).slice(0, 4000);
    if (name.length < 3) return { error: "Give the pilot a clear name." };
    if (!Number.isInteger(targetSize) || targetSize < 1 || targetSize > 100)
      return { error: "Pilot target size must be between 1 and 100." };
    const pilotId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO pilot_cohorts
        (id, name, stage, status, target_size, notes, created_by)
       VALUES (?, ?, 'internal', 'planning', ?, ?, ?)`,
    )
      .bind(pilotId, name, targetSize, notes || null, user.id)
      .run();
    await writeAudit(
      env.DB,
      user.id,
      "pilot.created",
      "pilot_cohort",
      pilotId,
      {
        targetSize,
      },
    );
    return { saved: "Pilot cohort created." };
  }

  if (intent === "update-pilot") {
    const pilotId = formText(form.get("pilotId"));
    const stage = formText(
      form.get("stage"),
    ) as NonNullable<PilotState>["stage"];
    const status = formText(
      form.get("status"),
    ) as NonNullable<PilotState>["status"];
    const notes = formText(form.get("notes")).slice(0, 4000);
    if (!pilotId || !pilotStages.has(stage) || !pilotStatuses.has(status))
      throw new Response("Invalid pilot update", { status: 400 });
    const result = await env.DB.prepare(
      `UPDATE pilot_cohorts SET
         stage = ?, status = ?, notes = ?,
         started_at = CASE
           WHEN ? = 'active' AND started_at IS NULL THEN datetime('now')
           ELSE started_at END,
         completed_at = CASE
           WHEN ? = 'completed' THEN COALESCE(completed_at, datetime('now'))
           WHEN ? != 'completed' THEN NULL ELSE completed_at END,
         updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(stage, status, notes || null, status, status, status, pilotId)
      .run();
    if (!result.meta.changes) return { error: "Pilot cohort not found." };
    await writeAudit(
      env.DB,
      user.id,
      "pilot.updated",
      "pilot_cohort",
      pilotId,
      {
        stage,
        status,
      },
    );
    return { saved: "Pilot stage updated." };
  }

  if (intent === "add-finding") {
    const cohortId = formText(form.get("cohortId"));
    const severity = formText(form.get("severity"));
    const area = formText(form.get("area")).slice(0, 120);
    const summary = formText(form.get("summary")).slice(0, 1000);
    const owner = formText(form.get("owner")).slice(0, 160);
    if (
      !cohortId ||
      !findingSeverities.has(severity) ||
      area.length < 2 ||
      summary.length < 5
    )
      return { error: "Finding severity, area and summary are required." };
    const findingId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO pilot_findings
        (id, cohort_id, severity, area, summary, owner, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        findingId,
        cohortId,
        severity,
        area,
        summary,
        owner || null,
        user.id,
      )
      .run();
    await writeAudit(
      env.DB,
      user.id,
      "pilot.finding.created",
      "pilot_finding",
      findingId,
      {
        cohortId,
        severity,
      },
    );
    return { saved: "Pilot finding recorded." };
  }

  if (intent === "resolve-finding") {
    const findingId = formText(form.get("findingId"));
    const resolutionNotes = formText(form.get("resolutionNotes")).slice(
      0,
      4000,
    );
    if (!findingId || resolutionNotes.length < 3)
      return { error: "Resolution evidence is required." };
    const result = await env.DB.prepare(
      `UPDATE pilot_findings SET status = 'resolved', resolution_notes = ?,
         resolved_by = ?, resolved_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND status != 'resolved'`,
    )
      .bind(resolutionNotes, user.id, findingId)
      .run();
    if (!result.meta.changes)
      return { error: "Finding was already resolved or could not be found." };
    await writeAudit(
      env.DB,
      user.id,
      "pilot.finding.resolved",
      "pilot_finding",
      findingId,
      {},
    );
    return { saved: "Finding resolved." };
  }

  throw new Response("Unsupported production operation", { status: 400 });
}

export default function AdminProduction({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const summaryClass = loaderData.readiness.readyForPilot
    ? "notice success"
    : "notice applicant-notice";

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Production and pilot operations</span>
            <h1>Launch command centre</h1>
            <p>
              Sign off live integrations, review automated production evidence,
              control the invited pilot and block expansion when findings
              remain.
            </p>
          </div>
          <div className="button-row">
            <Link className="button button-quiet" to="/admin/operations">
              Operations
            </Link>
            <Link className="button button-quiet" to="/admin/launch-gate">
              Launch gate
            </Link>
          </div>
        </header>

        {actionData?.saved && (
          <p className="notice success">{actionData.saved}</p>
        )}
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <section className={summaryClass} aria-live="polite">
          <strong>
            {loaderData.readiness.readyForPilot
              ? "Production evidence is current for an invited pilot."
              : `${loaderData.readiness.blockers.length} launch blocker${
                  loaderData.readiness.blockers.length === 1 ? "" : "s"
                } remain.`}
          </strong>
          {!loaderData.readiness.readyForPilot && (
            <p>{loaderData.readiness.blockers.join(" · ")}</p>
          )}
        </section>

        <section aria-labelledby="production-summary-title">
          <header>
            <span className="chapter">Current state</span>
            <h2 id="production-summary-title">Production readiness</h2>
          </header>
          <div className="member-home-stats">
            <div>
              <strong>
                {loaderData.readiness.publicAuditFresh ? "Current" : "Stale"}
              </strong>
              <span>Public audit</span>
            </div>
            <div>
              <strong>
                {loaderData.readiness.manualPassed}/
                {loaderData.readiness.manualTotal}
              </strong>
              <span>Reviewed checks</span>
            </div>
            <div>
              <strong>{loaderData.unresolvedFindings}</strong>
              <span>Open findings</span>
            </div>
            <div>
              <strong>{loaderData.criticalFindings}</strong>
              <span>Critical or high</span>
            </div>
          </div>
        </section>

        <section className="admin-panel" aria-labelledby="public-audit-title">
          <span className="chapter">Automated evidence</span>
          <h2 id="public-audit-title">Latest public production audit</h2>
          {loaderData.latestAudit ? (
            <>
              <p>
                <strong>Status:</strong> {loaderData.latestAudit.status} ·{" "}
                <strong>Completed:</strong>{" "}
                {formatDate(loaderData.latestAudit.completedAt)}
              </p>
              <p>
                <strong>Commit:</strong>{" "}
                {loaderData.latestAudit.commitSha ?? "Not recorded"}
              </p>
              {loaderData.latestAudit.workflowUrl && (
                <p>
                  <a href={loaderData.latestAudit.workflowUrl}>
                    Open workflow evidence
                  </a>
                </p>
              )}
              <div className="application-list">
                {loaderData.latestAudit.checks.map((check, index) => (
                  <article className="status-card" key={check.key ?? index}>
                    <span className="chapter">{check.status ?? "unknown"}</span>
                    <h3>{check.label ?? check.key ?? "Production check"}</h3>
                    {check.detail && <p>{check.detail}</p>}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p>No deployment audit has been persisted yet.</p>
          )}
        </section>

        <section className="admin-panel" aria-labelledby="configuration-title">
          <span className="chapter">Configuration</span>
          <h2 id="configuration-title">Detected production bindings</h2>
          <div className="application-list">
            {loaderData.integrations.map((integration) => (
              <article className="status-card" key={integration.label}>
                <span className="chapter">
                  {integration.ready ? "configured" : "missing"}
                </span>
                <h3>{integration.label}</h3>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="manual-checks-title">
          <header>
            <span className="chapter">Human evidence</span>
            <h2 id="manual-checks-title">Live integration sign-off</h2>
          </header>
          <div className="application-list">
            {loaderData.checks.map((check) => (
              <article className="admin-panel" key={check.key}>
                <span className="chapter">{check.category}</span>
                <h3>{check.label}</h3>
                <p>
                  {check.fresh
                    ? `Current until ${formatDate(check.record?.expiresAt ?? null)}`
                    : check.record?.status === "failed"
                      ? "Failed evidence blocks pilot readiness."
                      : "Current evidence is required."}
                </p>
                <Form method="post" className="stacked-form">
                  <input type="hidden" name="intent" value="save-check" />
                  <input type="hidden" name="checkKey" value={check.key} />
                  <label>
                    Status
                    <select
                      name="status"
                      defaultValue={check.record?.status ?? "pending"}
                    >
                      <option value="pending">Pending</option>
                      <option value="passed">Passed</option>
                      <option value="failed">Failed</option>
                      <option value="not_applicable">Not applicable</option>
                    </select>
                  </label>
                  <label>
                    Evidence reference
                    <input
                      name="evidenceReference"
                      defaultValue={
                        "evidenceReference" in (check.record ?? {})
                          ? ((check.record as CheckRow).evidenceReference ?? "")
                          : ""
                      }
                      placeholder="Workflow URL, audit record or internal reference"
                    />
                  </label>
                  <label>
                    Review notes
                    <textarea
                      name="notes"
                      rows={3}
                      defaultValue={
                        "notes" in (check.record ?? {})
                          ? ((check.record as CheckRow).notes ?? "")
                          : ""
                      }
                    />
                  </label>
                  <button className="button" type="submit">
                    Save evidence
                  </button>
                </Form>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-labelledby="new-pilot-title">
          <span className="chapter">Controlled rollout</span>
          <h2 id="new-pilot-title">Create invited pilot</h2>
          <Form method="post" className="stacked-form">
            <input type="hidden" name="intent" value="create-pilot" />
            <label>
              Pilot name
              <input name="name" placeholder="AKARI Founding Cohort" required />
            </label>
            <label>
              Target participants
              <input
                name="targetSize"
                type="number"
                min="1"
                max="100"
                defaultValue="15"
                required
              />
            </label>
            <label>
              Operating notes
              <textarea
                name="notes"
                rows={4}
                placeholder="Founders, Creators, Investors, campaign budget and support plan"
              />
            </label>
            <button className="button" type="submit">
              Create pilot
            </button>
          </Form>
        </section>

        <section aria-labelledby="pilot-cohorts-title">
          <header>
            <span className="chapter">Cohorts</span>
            <h2 id="pilot-cohorts-title">Pilot stage control</h2>
          </header>
          <div className="application-list">
            {loaderData.pilots.length === 0 && (
              <p>No pilot cohort created yet.</p>
            )}
            {loaderData.pilots.map((pilot) => (
              <article className="admin-panel" key={pilot.id}>
                <span className="chapter">{pilot.status}</span>
                <h3>{pilot.name}</h3>
                <p>
                  Target {pilot.targetSize} · Started{" "}
                  {formatDate(pilot.startedAt)} · Completed{" "}
                  {formatDate(pilot.completedAt)}
                </p>
                <Form method="post" className="stacked-form">
                  <input type="hidden" name="intent" value="update-pilot" />
                  <input type="hidden" name="pilotId" value={pilot.id} />
                  <label>
                    Stage
                    <select name="stage" defaultValue={pilot.stage}>
                      <option value="internal">Internal test</option>
                      <option value="invited_15">Up to 15 invited</option>
                      <option value="invited_25">Up to 25 invited</option>
                      <option value="invited_50">Up to 50 invited</option>
                      <option value="invited_100">Up to 100 invited</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select name="status" defaultValue={pilot.status}>
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                  <label>
                    Notes
                    <textarea
                      name="notes"
                      rows={4}
                      defaultValue={pilot.notes ?? ""}
                    />
                  </label>
                  <button className="button" type="submit">
                    Update pilot
                  </button>
                </Form>

                <Form method="post" className="stacked-form">
                  <input type="hidden" name="intent" value="add-finding" />
                  <input type="hidden" name="cohortId" value={pilot.id} />
                  <h4>Record finding</h4>
                  <label>
                    Severity
                    <select name="severity" defaultValue="medium">
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </label>
                  <label>
                    Area
                    <input
                      name="area"
                      placeholder="Settlement, onboarding, mobile…"
                      required
                    />
                  </label>
                  <label>
                    Finding
                    <textarea name="summary" rows={3} required />
                  </label>
                  <label>
                    Owner
                    <input name="owner" placeholder="Responsible team member" />
                  </label>
                  <button className="button button-quiet" type="submit">
                    Add finding
                  </button>
                </Form>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="findings-title">
          <header>
            <span className="chapter">Pilot defects and observations</span>
            <h2 id="findings-title">Findings register</h2>
          </header>
          <div className="application-list">
            {loaderData.findings.length === 0 && (
              <p>No pilot findings recorded.</p>
            )}
            {loaderData.findings.map((finding) => (
              <article className="status-card" key={finding.id}>
                <span className="chapter">
                  {finding.severity} · {finding.status}
                </span>
                <h3>{finding.area}</h3>
                <p>{finding.summary}</p>
                <p>
                  Owner: {finding.owner ?? "Unassigned"} · Created{" "}
                  {formatDate(finding.createdAt)}
                </p>
                {finding.status === "resolved" ? (
                  <p>
                    Resolved {formatDate(finding.resolvedAt)} ·{" "}
                    {finding.resolutionNotes}
                  </p>
                ) : (
                  <Form method="post" className="stacked-form">
                    <input
                      type="hidden"
                      name="intent"
                      value="resolve-finding"
                    />
                    <input type="hidden" name="findingId" value={finding.id} />
                    <label>
                      Resolution evidence
                      <textarea name="resolutionNotes" rows={3} required />
                    </label>
                    <button className="button button-quiet" type="submit">
                      Resolve finding
                    </button>
                  </Form>
                )}
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
