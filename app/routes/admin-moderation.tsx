import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-moderation";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "moderation");
  const reports = await db
    .prepare(
      `SELECT mr.id, mr.subject_type AS subjectType,
              mr.subject_id AS subjectId, mr.reason, mr.details, mr.status,
              mr.created_at AS createdAt, p.display_name AS reporterName
       FROM moderation_reports mr
       JOIN profiles p ON p.user_id = mr.reporter_user_id
       WHERE mr.status IN ('open', 'reviewing')
       ORDER BY mr.created_at`,
    )
    .all<{
      id: string;
      subjectType: string;
      subjectId: string;
      reason: string;
      details: string;
      status: string;
      createdAt: string;
      reporterName: string;
    }>();
  return { user, reports: reports.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdminScope(request, db, "moderation");
  const form = await request.formData();
  const reportId = formText(form.get("reportId"));
  const intent = formText(form.get("intent"));
  const note = formText(form.get("resolutionNote")).trim();
  const enforcement = formText(form.get("enforcement"));
  const status =
    intent === "review"
      ? "reviewing"
      : intent === "resolve"
        ? "resolved"
        : intent === "dismiss"
          ? "dismissed"
          : null;
  if (
    !status ||
    note.length > 1000 ||
    !["none", "hide_content", "suspend_account"].includes(enforcement)
  )
    return { error: "Check the moderation decision." };
  const report = await db
    .prepare(
      `SELECT subject_type AS subjectType, subject_id AS subjectId
       FROM moderation_reports WHERE id = ?`,
    )
    .bind(reportId)
    .first<{ subjectType: string; subjectId: string }>();
  if (!report) throw new Response("Report not found.", { status: 404 });
  if (enforcement === "suspend_account" && report.subjectType !== "profile")
    return { error: "Account suspension applies only to profile reports." };
  if (
    enforcement === "hide_content" &&
    !["project", "event"].includes(report.subjectType)
  )
    return { error: "Content hiding applies only to projects or events." };
  const statements = [
    db
      .prepare(
        `UPDATE moderation_reports SET status = ?, reviewed_by = ?,
         reviewed_at = CASE WHEN ? IN ('resolved', 'dismissed')
           THEN datetime('now') ELSE reviewed_at END,
         resolution_note = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(status, admin.id, status, note, reportId),
  ];
  if (enforcement === "suspend_account") {
    statements.push(
      db
        .prepare(
          `UPDATE users SET status = 'suspended',
         updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(report.subjectId),
      db
        .prepare("DELETE FROM sessions WHERE user_id = ?")
        .bind(report.subjectId),
    );
  }
  if (enforcement === "hide_content" && report.subjectType === "project")
    statements.push(
      db
        .prepare(
          `UPDATE projects SET status = 'archived',
         updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(report.subjectId),
    );
  if (enforcement === "hide_content" && report.subjectType === "event")
    statements.push(
      db
        .prepare(
          `UPDATE events SET status = 'cancelled',
         updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(report.subjectId),
    );
  statements.push(
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'moderation.decision', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        report.subjectType,
        report.subjectId,
        JSON.stringify({ status, enforcement, reportId, note }),
      ),
  );
  await db.batch(statements);
  return { saved: true };
}

export default function AdminModeration({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Trust and safety desk</span>
            <h1>Moderation reports</h1>
          </div>
          <Link className="button button-quiet" to="/admin/interests">
            Review desk
          </Link>
        </header>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && <p className="notice success">Report updated.</p>}
        <div className="application-list" aria-busy={pending}>
          {loaderData.reports.length ? (
            loaderData.reports.map((report) => (
              <article className="application-card" key={report.id}>
                <div>
                  <span className="chapter">
                    {report.subjectType} · {report.reason}
                  </span>
                  <h2>{report.status}</h2>
                  <p>{report.details || "No additional details."}</p>
                  <small>Reported by {report.reporterName}</small>
                </div>
                <Form method="post" className="application-actions">
                  <input type="hidden" name="reportId" value={report.id} />
                  <label className="application-decision-note">
                    Internal resolution note
                    <textarea name="resolutionNote" rows={3} maxLength={1000} />
                  </label>
                  <label className="application-decision-note">
                    Enforcement
                    <select name="enforcement" defaultValue="none">
                      <option value="none">No enforcement</option>
                      <option value="hide_content">
                        Hide project or cancel event
                      </option>
                      <option value="suspend_account">
                        Suspend reported profile account
                      </option>
                    </select>
                  </label>
                  <button
                    className="button button-quiet"
                    name="intent"
                    value="review"
                    disabled={pending}
                  >
                    Mark reviewing
                  </button>
                  <button
                    className="button button-primary"
                    name="intent"
                    value="resolve"
                    disabled={pending}
                    onClick={(event) => {
                      const form = event.currentTarget.form;
                      const enforcement = form?.elements.namedItem(
                        "enforcement",
                      ) as HTMLSelectElement | null;
                      if (
                        enforcement?.value !== "none" &&
                        !window.confirm(
                          "Apply this enforcement and resolve the report? This can immediately hide content or suspend an account.",
                        )
                      )
                        event.preventDefault();
                    }}
                  >
                    Resolve
                  </button>
                  <button
                    className="button button-quiet"
                    name="intent"
                    value="dismiss"
                    disabled={pending}
                  >
                    Dismiss
                  </button>
                </Form>
              </article>
            ))
          ) : (
            <div className="status-card">
              <h2>No open moderation reports.</h2>
              <p>New member reports will appear here for review.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
