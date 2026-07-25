import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin-resilience";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import { ensureOperationalResilienceSchema } from "~/lib/operational-resilience-schema.server";
import { runR2Cleanup, runR2Inventory } from "~/lib/r2-lifecycle.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

const runTypes = [
  "d1_backup",
  "d1_restore_test",
  "r2_inventory",
  "r2_cleanup",
  "secret_rotation",
  "incident_drill",
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  await ensureOperationalResilienceSchema(env.DB);
  const [runs, incidents, objectCounts, findings] = await Promise.all([
    env.DB.prepare(
      `SELECT id, run_type AS runType, status, started_at AS startedAt,
              completed_at AS completedAt, evidence_reference AS evidenceReference,
              notes, metadata_json AS metadataJson
       FROM operational_runs ORDER BY started_at DESC LIMIT 40`,
    ).all<{
      id: string;
      runType: string;
      status: string;
      startedAt: string;
      completedAt: string | null;
      evidenceReference: string | null;
      notes: string | null;
      metadataJson: string;
    }>(),
    env.DB.prepare(
      `SELECT id, severity, category, status, title, summary,
              detected_at AS detectedAt, resolved_at AS resolvedAt
       FROM incident_records ORDER BY detected_at DESC LIMIT 30`,
    ).all<{
      id: string;
      severity: string;
      category: string;
      status: string;
      title: string;
      summary: string;
      detectedAt: string;
      resolvedAt: string | null;
    }>(),
    env.DB.prepare(
      `SELECT retention_status AS status, COUNT(*) AS total
       FROM managed_r2_objects GROUP BY retention_status`,
    ).all<{ status: string; total: number }>(),
    env.DB.prepare(
      `SELECT object_key AS objectKey, finding_type AS findingType,
              source_type AS sourceType, source_id AS sourceId,
              first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
       FROM r2_inventory_findings
       WHERE resolved_at IS NULL
       ORDER BY finding_type, last_seen_at DESC LIMIT 100`,
    ).all<{
      objectKey: string;
      findingType: string;
      sourceType: string | null;
      sourceId: string | null;
      firstSeenAt: string;
      lastSeenAt: string;
    }>(),
  ]);
  return {
    user,
    runs: runs.results.map((run) => ({
      ...run,
      metadata: (() => {
        try {
          return JSON.parse(run.metadataJson) as Record<string, unknown>;
        } catch {
          return {};
        }
      })(),
    })),
    incidents: incidents.results,
    objectCounts: objectCounts.results,
    findings: findings.results,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  await ensureOperationalResilienceSchema(env.DB);
  const data = await request.formData();
  const intent = formText(data.get("intent"));

  if (intent === "run-r2-inventory") {
    await runR2Inventory(env);
  } else if (intent === "run-r2-cleanup") {
    await runR2Cleanup(env);
  } else if (intent === "record-run") {
    const runType = formText(data.get("runType"));
    const status = formText(data.get("status"));
    if (!runTypes.includes(runType as (typeof runTypes)[number])) {
      throw new Response("Invalid run type", { status: 400 });
    }
    if (!["passed", "failed", "cancelled"].includes(status)) {
      throw new Response("Invalid run status", { status: 400 });
    }
    await env.DB.prepare(
      `INSERT INTO operational_runs
       (id, run_type, status, started_at, completed_at, initiated_by,
        evidence_reference, notes)
       VALUES (?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        runType,
        status,
        user.id,
        formText(data.get("evidenceReference")).slice(0, 500) || null,
        formText(data.get("notes")).slice(0, 2000) || null,
      )
      .run();
  } else if (intent === "open-incident") {
    const severity = formText(data.get("severity"));
    if (!["sev1", "sev2", "sev3", "sev4"].includes(severity)) {
      throw new Response("Invalid severity", { status: 400 });
    }
    await env.DB.prepare(
      `INSERT INTO incident_records
       (id, severity, category, status, title, summary, owner_user_id)
       VALUES (?, ?, ?, 'open', ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        severity,
        formText(data.get("category")).slice(0, 80) || "service",
        formText(data.get("title")).slice(0, 180),
        formText(data.get("summary")).slice(0, 4000),
        user.id,
      )
      .run();
  } else if (intent === "resolve-incident") {
    await env.DB.prepare(
      `UPDATE incident_records
       SET status = 'resolved', resolved_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(formText(data.get("incidentId")))
      .run();
  } else {
    throw new Response("Unknown action", { status: 400 });
  }

  return redirect("/admin/resilience");
}

export default function AdminResilience({ loaderData }: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Operational resilience</span>
            <h1>Backup, recovery and storage integrity</h1>
            <p>
              Automated D1 recovery evidence, registered R2 lifecycle control,
              inventory findings and incident decisions.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin/operations">
            Command centre
          </Link>
        </header>

        <section className="admin-panel">
          <span className="chapter">Private R2 storage</span>
          <h2>Inventory and retention</h2>
          <p>
            Inventory reports unknown objects without deleting them. Cleanup
            only removes registered objects after their retention window and
            seven-day soft-delete grace period.
          </p>
          <div className="member-home-stats" aria-label="Managed R2 objects">
            {loaderData.objectCounts.map((item) => (
              <div key={item.status}>
                <strong>{item.total}</strong>
                <span>{item.status.replaceAll("_", " ")}</span>
              </div>
            ))}
          </div>
          <div className="button-row">
            <Form method="post">
              <button
                className="button button-primary"
                name="intent"
                value="run-r2-inventory"
              >
                Run R2 inventory
              </button>
            </Form>
            <Form method="post">
              <button
                className="button button-quiet"
                name="intent"
                value="run-r2-cleanup"
              >
                Run eligible cleanup
              </button>
            </Form>
          </div>
        </section>

        <section aria-labelledby="r2-findings-title">
          <h2 id="r2-findings-title">Open storage findings</h2>
          <div className="application-list">
            {loaderData.findings.map((finding) => (
              <article
                className="application-card"
                key={`${finding.findingType}:${finding.objectKey}`}
              >
                <div>
                  <span className="chapter">{finding.findingType}</span>
                  <h3>{finding.objectKey}</h3>
                  {finding.sourceType && (
                    <p>
                      Registered as {finding.sourceType.replaceAll("_", " ")}
                      {finding.sourceId ? ` · ${finding.sourceId}` : ""}
                    </p>
                  )}
                </div>
                <time dateTime={finding.lastSeenAt}>
                  {new Date(finding.lastSeenAt).toLocaleString()}
                </time>
              </article>
            ))}
            {!loaderData.findings.length && (
              <article className="status-card">
                <h3>No unresolved R2 inventory findings.</h3>
              </article>
            )}
          </div>
        </section>

        <section className="admin-panel">
          <span className="chapter">External recovery evidence</span>
          <h2>Record an operational run</h2>
          <p>
            Automated D1 drills record themselves. Use this form only for
            reviewed evidence produced outside the automated workflow.
          </p>
          <Form method="post" className="form-stack">
            <input type="hidden" name="intent" value="record-run" />
            <label>
              Run type
              <select name="runType" required>
                {runTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Result
              <select name="status" required>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label>
              Evidence reference
              <input
                name="evidenceReference"
                maxLength={500}
                placeholder="Private report, export or ticket reference"
              />
            </label>
            <label>
              Notes
              <textarea name="notes" maxLength={2000} />
            </label>
            <button className="button button-primary" type="submit">
              Record run
            </button>
          </Form>
        </section>

        <section className="admin-panel">
          <span className="chapter">Incident response</span>
          <h2>Open an incident</h2>
          <Form method="post" className="form-stack">
            <input type="hidden" name="intent" value="open-incident" />
            <label>
              Severity
              <select name="severity" required>
                <option value="sev1">SEV1 · Critical</option>
                <option value="sev2">SEV2 · Major</option>
                <option value="sev3">SEV3 · Moderate</option>
                <option value="sev4">SEV4 · Minor</option>
              </select>
            </label>
            <label>
              Category
              <input name="category" maxLength={80} required />
            </label>
            <label>
              Title
              <input name="title" maxLength={180} required />
            </label>
            <label>
              Summary
              <textarea name="summary" maxLength={4000} required />
            </label>
            <button className="button button-primary" type="submit">
              Open incident
            </button>
          </Form>
        </section>

        <section aria-labelledby="resilience-runs">
          <h2 id="resilience-runs">Recent operational runs</h2>
          <div className="application-list">
            {loaderData.runs.map((run) => (
              <article className="application-card" key={run.id}>
                <div>
                  <span className="chapter">{run.status}</span>
                  <h3>{run.runType.replaceAll("_", " ")}</h3>
                  {run.notes && <p>{run.notes}</p>}
                  {run.evidenceReference && (
                    <p>Evidence: {run.evidenceReference}</p>
                  )}
                  {Object.keys(run.metadata).length > 0 && (
                    <details>
                      <summary>Run details</summary>
                      <pre>{JSON.stringify(run.metadata, null, 2)}</pre>
                    </details>
                  )}
                </div>
                <time dateTime={run.startedAt}>
                  {new Date(run.startedAt).toLocaleString()}
                </time>
              </article>
            ))}
            {!loaderData.runs.length && (
              <article className="status-card">
                <h3>No recovery evidence recorded yet.</h3>
              </article>
            )}
          </div>
        </section>

        <section aria-labelledby="resilience-incidents">
          <h2 id="resilience-incidents">Incident register</h2>
          <div className="application-list">
            {loaderData.incidents.map((incident) => (
              <article className="application-card" key={incident.id}>
                <div>
                  <span className="chapter">
                    {incident.severity} · {incident.status}
                  </span>
                  <h3>{incident.title}</h3>
                  <p>{incident.summary}</p>
                </div>
                {!incident.resolvedAt && (
                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value="resolve-incident"
                    />
                    <input
                      type="hidden"
                      name="incidentId"
                      value={incident.id}
                    />
                    <button className="button button-quiet" type="submit">
                      Mark resolved
                    </button>
                  </Form>
                )}
              </article>
            ))}
            {!loaderData.incidents.length && (
              <article className="status-card">
                <h3>No incidents recorded.</h3>
              </article>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
