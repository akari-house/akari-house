import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin-resilience";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import { ensureOperationalResilienceSchema } from "~/lib/operational-resilience-schema.server";
import { assertSameOrigin } from "~/lib/security.server";

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
  const [runs, incidents, objectCounts] = await Promise.all([
    env.DB.prepare(
      `SELECT id, run_type AS runType, status, started_at AS startedAt,
              completed_at AS completedAt, evidence_reference AS evidenceReference,
              notes
       FROM operational_runs ORDER BY started_at DESC LIMIT 30`,
    ).all<{
      id: string;
      runType: string;
      status: string;
      startedAt: string;
      completedAt: string | null;
      evidenceReference: string | null;
      notes: string | null;
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
  ]);
  return {
    user,
    runs: runs.results,
    incidents: incidents.results,
    objectCounts: objectCounts.results,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  await ensureOperationalResilienceSchema(env.DB);
  const data = await request.formData();
  const intent = String(data.get("intent") || "");

  if (intent === "record-run") {
    const runType = String(data.get("runType") || "");
    const status = String(data.get("status") || "");
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
        String(data.get("evidenceReference") || "").slice(0, 500) || null,
        String(data.get("notes") || "").slice(0, 2000) || null,
      )
      .run();
  } else if (intent === "open-incident") {
    const severity = String(data.get("severity") || "");
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
        String(data.get("category") || "service").slice(0, 80),
        String(data.get("title") || "").slice(0, 180),
        String(data.get("summary") || "").slice(0, 4000),
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
      .bind(String(data.get("incidentId") || ""))
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
            <h1>Backup, recovery and incidents</h1>
            <p>Record evidence, restore tests, storage lifecycle checks and incident decisions.</p>
          </div>
          <Link className="button button-quiet" to="/admin/operations">Command centre</Link>
        </header>

        <section className="admin-panel">
          <span className="chapter">Recovery evidence</span>
          <h2>Record an operational run</h2>
          <Form method="post" className="form-stack">
            <input type="hidden" name="intent" value="record-run" />
            <label>Run type<select name="runType" required>{runTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
            <label>Result<select name="status" required><option value="passed">Passed</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></label>
            <label>Evidence reference<input name="evidenceReference" maxLength={500} placeholder="Private report, export or ticket reference" /></label>
            <label>Notes<textarea name="notes" maxLength={2000} /></label>
            <button className="button button-primary" type="submit">Record run</button>
          </Form>
        </section>

        <section className="admin-panel">
          <span className="chapter">Incident response</span>
          <h2>Open an incident</h2>
          <Form method="post" className="form-stack">
            <input type="hidden" name="intent" value="open-incident" />
            <label>Severity<select name="severity" required><option value="sev1">SEV1 · Critical</option><option value="sev2">SEV2 · Major</option><option value="sev3">SEV3 · Moderate</option><option value="sev4">SEV4 · Minor</option></select></label>
            <label>Category<input name="category" maxLength={80} required /></label>
            <label>Title<input name="title" maxLength={180} required /></label>
            <label>Summary<textarea name="summary" maxLength={4000} required /></label>
            <button className="button button-primary" type="submit">Open incident</button>
          </Form>
        </section>

        <section aria-labelledby="resilience-runs">
          <h2 id="resilience-runs">Recent operational runs</h2>
          <div className="application-list">
            {loaderData.runs.map((run) => <article className="application-card" key={run.id}><div><span className="chapter">{run.status}</span><h3>{run.runType.replaceAll("_", " ")}</h3>{run.notes && <p>{run.notes}</p>}{run.evidenceReference && <p>Evidence: {run.evidenceReference}</p>}</div><time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time></article>)}
            {!loaderData.runs.length && <article className="status-card"><h3>No recovery evidence recorded yet.</h3></article>}
          </div>
        </section>

        <section aria-labelledby="resilience-incidents">
          <h2 id="resilience-incidents">Incident register</h2>
          <div className="application-list">
            {loaderData.incidents.map((incident) => <article className="application-card" key={incident.id}><div><span className="chapter">{incident.severity} · {incident.status}</span><h3>{incident.title}</h3><p>{incident.summary}</p></div>{!incident.resolvedAt && <Form method="post"><input type="hidden" name="intent" value="resolve-incident" /><input type="hidden" name="incidentId" value={incident.id} /><button className="button button-quiet" type="submit">Mark resolved</button></Form>}</article>)}
            {!loaderData.incidents.length && <article className="status-card"><h3>No incidents recorded.</h3></article>}
          </div>
        </section>
      </main>
    </div>
  );
}
