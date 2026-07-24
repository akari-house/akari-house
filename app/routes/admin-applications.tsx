import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-applications";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  sendApprovalEmail,
  type MembershipEmailEnvironment,
} from "~/lib/email.server";
import { requireAdmin } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdmin(request, db);
  const applications = await db
    .prepare(
      `SELECT ma.id, ma.status, ma.applicant_note AS applicantNote,
              ma.created_at AS createdAt, u.email, u.username,
              u.email_verified_at AS emailVerifiedAt,
              p.display_name AS displayName,
              group_concat(ur.role, ', ') AS roles
       FROM membership_applications ma
       JOIN users u ON u.id = ma.user_id
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE ma.status IN ('pending_email', 'pending_review', 'waitlisted')
       GROUP BY ma.id
       ORDER BY ma.created_at ASC`,
    )
    .all<{
      id: string;
      status: string;
      applicantNote: string;
      createdAt: string;
      email: string;
      username: string;
      emailVerifiedAt: string | null;
      displayName: string;
      roles: string;
    }>();
  return { user, applications: applications.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const env = context.get(cloudflareContext).env as CloudflareEnvironment &
    MembershipEmailEnvironment;
  const db = env.DB;
  const admin = await requireAdmin(request, db);
  const formData = await request.formData();
  const applicationId = formText(formData.get("applicationId"));
  const intent = formText(formData.get("intent"));
  const decisionNote = formText(formData.get("decisionNote")).trim();
  if (!["approve", "waitlist", "decline"].includes(intent))
    throw new Response("Invalid decision", { status: 400 });
  if (decisionNote.length < 5 || decisionNote.length > 500)
    return { error: "Add a decision note between 5 and 500 characters." };

  const status =
    intent === "approve"
      ? "approved"
      : intent === "waitlist"
        ? "waitlisted"
        : "declined";
  const application = await db
    .prepare(
      `SELECT ma.user_id AS userId, ma.status,
              u.email, u.email_verified_at AS emailVerifiedAt
       FROM membership_applications ma
       JOIN users u ON u.id = ma.user_id
       WHERE ma.id = ?`,
    )
    .bind(applicationId)
    .first<{
      userId: string;
      status: string;
      email: string;
      emailVerifiedAt: string | null;
    }>();
  if (
    !application ||
    !["pending_review", "waitlisted"].includes(application.status) ||
    (status === "approved" && !application.emailVerifiedAt)
  )
    return {
      error:
        "That application could not be changed. Confirm the email is verified and refresh the list.",
    };

  await db.batch([
    db
      .prepare(
        `UPDATE membership_applications
         SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
             decision_note = ?, updated_at = datetime('now')
         WHERE id = ? AND status IN ('pending_review', 'waitlisted')`,
      )
      .bind(status, admin.id, decisionNote, applicationId),
    db
      .prepare(
        "UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .bind(
        status === "approved" ? "active" : "restricted",
        application.userId,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json) VALUES (?, ?, 'membership.decision', 'membership_application', ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        applicationId,
        JSON.stringify({ status, decisionNote }),
      ),
  ]);
  if (status === "approved") await sendApprovalEmail(env, application.email);
  return { saved: true };
}

export default function AdminApplications({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Membership Desk</span>
            <h1>Review requests</h1>
          </div>
          <Link className="button button-quiet" to="/app">
            Return to profile
          </Link>
          <Link className="button button-quiet" to="/admin/interests">
            Projects and interests
          </Link>
          <Link className="button button-quiet" to="/admin/moderation">
            Moderation
          </Link>
        </header>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success">Membership decision saved.</p>
        )}
        <div className="application-list">
          {loaderData.applications.length === 0 ? (
            <div className="status-card">
              <h2>The desk is clear</h2>
              <p>There are no requests waiting for a decision.</p>
            </div>
          ) : (
            loaderData.applications.map((application) => (
              <article className="application-card" key={application.id}>
                <div>
                  <span className="chapter">
                    {application.status.replace("_", " ")}
                  </span>
                  <h2>{application.displayName}</h2>
                  <p>
                    {application.email} · @{application.username}
                  </p>
                  <p>{application.roles}</p>
                </div>
                <blockquote>{application.applicantNote}</blockquote>
                <div className="application-meta">
                  <span>
                    Email{" "}
                    {application.emailVerifiedAt
                      ? "confirmed"
                      : "not confirmed"}
                  </span>
                  <time dateTime={application.createdAt}>
                    {new Date(application.createdAt).toLocaleDateString()}
                  </time>
                </div>
                <Form method="post" className="application-actions">
                  <input
                    type="hidden"
                    name="applicationId"
                    value={application.id}
                  />
                  <label className="application-decision-note">
                    Decision note
                    <textarea
                      name="decisionNote"
                      minLength={5}
                      maxLength={500}
                      rows={3}
                      required
                      placeholder="Record the reason for this decision."
                    />
                  </label>
                  <button
                    className="button button-primary"
                    name="intent"
                    value="approve"
                    disabled={
                      !application.emailVerifiedAt ||
                      navigation.state !== "idle"
                    }
                  >
                    Approve
                  </button>
                  <button
                    className="button button-quiet"
                    name="intent"
                    value="waitlist"
                    disabled={navigation.state !== "idle"}
                  >
                    Waitlist
                  </button>
                  <button
                    className="button button-quiet"
                    name="intent"
                    value="decline"
                    disabled={navigation.state !== "idle"}
                  >
                    Decline
                  </button>
                </Form>
              </article>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
