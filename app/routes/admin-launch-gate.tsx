import { Form, Link } from "react-router";
import type { Route } from "./+types/admin-launch-gate";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { launchGateChecks, launchGateStatus } from "~/lib/launch-gate";
import { ensureLaunchGateSchema } from "~/lib/launch-gate-schema.server";
import { requireSuperAdmin } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  await ensureLaunchGateSchema(env.DB);
  const rows = await env.DB.prepare(
    `SELECT check_key AS checkKey, status, environment, evidence_reference AS evidenceReference,
            notes, tested_at AS testedAt
     FROM launch_gate_results`,
  ).all<{ checkKey: string; status: string; environment: string; evidenceReference: string | null; notes: string | null; testedAt: string | null }>();
  const byKey = new Map(rows.results.map((row) => [row.checkKey, row]));
  const summary = launchGateStatus(rows.results.filter((row) => row.status === "passed").map((row) => row.checkKey));
  return { user, checks: launchGateChecks.map(([key, description]) => ({ key, description, result: byKey.get(key) ?? null })), summary };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  await ensureLaunchGateSchema(env.DB);
  const form = await request.formData();
  const checkKey = formText(form.get("checkKey"));
  const status = formText(form.get("status"));
  const allowed = new Set(launchGateChecks.map(([key]) => key));
  if (!allowed.has(checkKey as (typeof launchGateChecks)[number][0]) || !["pending", "passed", "failed", "waived"].includes(status)) {
    throw new Response("Invalid launch-gate result", { status: 400 });
  }
  await env.DB.prepare(
    `INSERT INTO launch_gate_results
      (check_key, status, environment, evidence_reference, notes, tested_by, tested_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(check_key) DO UPDATE SET
       status = excluded.status,
       environment = excluded.environment,
       evidence_reference = excluded.evidence_reference,
       notes = excluded.notes,
       tested_by = excluded.tested_by,
       tested_at = datetime('now'),
       updated_at = datetime('now')`,
  ).bind(
    checkKey,
    status,
    formText(form.get("environment")) || "production",
    formText(form.get("evidenceReference")) || null,
    formText(form.get("notes")) || null,
    user.id,
  ).run();
  return { saved: true };
}

export default function AdminLaunchGate({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div><span className="eyebrow">Commercial launch gate</span><h1>Real-role permission testing</h1><p>{loaderData.summary.complete} of {loaderData.summary.total} checks passed.</p></div>
          <Link className="button button-quiet" to="/admin/operations">Command centre</Link>
        </header>
        {actionData?.saved && <p className="notice success">Launch-gate evidence saved.</p>}
        <section className={loaderData.summary.ready ? "notice success" : "notice applicant-notice"} aria-live="polite">
          <strong>{loaderData.summary.ready ? "Launch gate passed" : "Launch remains blocked"}</strong>
          <p>Only passed checks count towards commercial launch readiness. Waivers remain visible but do not count as passed.</p>
        </section>
        <div className="application-list">
          {loaderData.checks.map((check) => (
            <article className="application-card" key={check.key}>
              <div><span className="chapter">{check.result?.status ?? "pending"}</span><h2>{check.key.replaceAll("_", " ")}</h2><p>{check.description}</p>{check.result?.evidenceReference && <p>Evidence: {check.result.evidenceReference}</p>}</div>
              <Form method="post" className="form-stack">
                <input type="hidden" name="checkKey" value={check.key} />
                <label>Status<select name="status" defaultValue={check.result?.status ?? "pending"}><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="waived">Waived</option></select></label>
                <label>Environment<input name="environment" defaultValue={check.result?.environment ?? "production"} /></label>
                <label>Evidence reference<input name="evidenceReference" defaultValue={check.result?.evidenceReference ?? ""} /></label>
                <label>Notes<textarea name="notes" defaultValue={check.result?.notes ?? ""} /></label>
                <button className="button button-primary" type="submit">Save evidence</button>
              </Form>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
