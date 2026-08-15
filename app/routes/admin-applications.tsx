import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-applications";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  sendApprovalEmail,
  type MembershipEmailEnvironment,
} from "~/lib/email.server";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type MembershipApplicationRow = {
  id: string;
  status: string;
  applicantNote: string;
  decisionNote: string;
  createdAt: string;
  username: string;
  emailVerifiedAt: string | null;
  displayName: string;
  roles: string;
  evidencePlatform: string | null;
  evidenceUrl: string | null;
};

function statusLabel(status: string) {
  if (status === "pending_email") return "Email pending";
  if (status === "waitlisted") return "Needs info";
  return "Ready for review";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "membership");
  const applications = await db
    .prepare(
      `SELECT ma.id, ma.status, ma.applicant_note AS applicantNote,
              ma.decision_note AS decisionNote, ma.created_at AS createdAt,
              u.username, u.email_verified_at AS emailVerifiedAt,
              p.display_name AS displayName,
              group_concat(ur.role, ', ') AS roles,
              (SELECT psa.platform
                 FROM profile_social_accounts psa
                WHERE psa.user_id = u.id AND trim(psa.profile_url) <> ''
                ORDER BY CASE psa.platform
                  WHEN 'x' THEN 0 WHEN 'linkedin' THEN 1 ELSE 2 END,
                  psa.updated_at DESC
                LIMIT 1) AS evidencePlatform,
              (SELECT psa.profile_url
                 FROM profile_social_accounts psa
                WHERE psa.user_id = u.id AND trim(psa.profile_url) <> ''
                ORDER BY CASE psa.platform
                  WHEN 'x' THEN 0 WHEN 'linkedin' THEN 1 ELSE 2 END,
                  psa.updated_at DESC
                LIMIT 1) AS evidenceUrl
       FROM membership_applications ma
       JOIN users u ON u.id = ma.user_id
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE ma.status IN ('pending_email', 'pending_review', 'waitlisted')
       GROUP BY ma.id
       ORDER BY CASE ma.status
         WHEN 'pending_review' THEN 0
         WHEN 'pending_email' THEN 1
         ELSE 2 END,
         ma.created_at ASC`,
    )
    .all<MembershipApplicationRow>();
  const rows = applications.results;
  return {
    user,
    applications: rows,
    counts: {
      pending: rows.filter((item) => item.status === "pending_review").length,
      email: rows.filter((item) => item.status === "pending_email").length,
      needsInfo: rows.filter((item) => item.status === "waitlisted").length,
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const env = context.get(cloudflareContext).env as CloudflareEnvironment &
    MembershipEmailEnvironment;
  const db = env.DB;
  const admin = await requireAdminScope(request, db, "membership");
  const formData = await request.formData();
  const applicationId = formText(formData.get("applicationId"));
  const intent = formText(formData.get("intent"));
  const suppliedNote = formText(formData.get("decisionNote")).trim();
  if (!["approve", "request_info", "decline"].includes(intent))
    throw new Response("Invalid decision", { status: 400 });

  const decisionNote =
    suppliedNote ||
    (intent === "approve" ? "Approved from the membership review queue." : "");
  if (decisionNote.length < 5 || decisionNote.length > 500)
    return {
      error:
        intent === "approve"
          ? "Keep the decision note under 500 characters."
          : "Add a note between 5 and 500 characters so the applicant understands the decision.",
    };

  const status =
    intent === "approve"
      ? "approved"
      : intent === "request_info"
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
    ...(status === "approved"
      ? [
          db
            .prepare(
              `UPDATE profiles
               SET visibility = CASE
                     WHEN visibility = 'private' THEN 'public'
                     ELSE visibility
                   END,
                   updated_at = datetime('now')
               WHERE user_id = ?`,
            )
            .bind(application.userId),
          db
            .prepare(
              `UPDATE profile_visibility
               SET visibility = CASE
                     WHEN visibility = 'private' THEN 'public'
                     ELSE visibility
                   END,
                   updated_at = datetime('now')
               WHERE user_id = ?`,
            )
            .bind(application.userId),
        ]
      : []),
    ...(intent === "request_info"
      ? [
          db
            .prepare(
              `INSERT INTO notifications
               (id, user_id, kind, title, body, action_url)
               VALUES (?, ?, 'membership.info_requested',
                 'More information requested', ?, '/app')`,
            )
            .bind(crypto.randomUUID(), application.userId, decisionNote),
        ]
      : []),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json) VALUES (?, ?, 'membership.decision', 'membership_application', ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        applicationId,
        JSON.stringify({ status, intent, decisionNote }),
      ),
  ]);
  if (status === "approved") await sendApprovalEmail(env, application.email);
  return { saved: true, applicationId, intent };
}

export default function AdminApplications({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [selectedApplicationId, setSelectedApplicationId] = useState<
    string | null
  >(null);
  const selectedApplication =
    loaderData.applications.find(
      (application) => application.id === selectedApplicationId,
    ) ??
    loaderData.applications[0] ??
    null;

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Membership approvals</span>
            <h1>Review queue</h1>
            <p>
              Scan requests in one compact list. Open the review panel only when
              you need the applicant context or a decision.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin">
            Admin overview
          </Link>
        </header>

        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success" role="status">
            Membership decision saved.
          </p>
        )}

        <div className="application-queue-summary" aria-label="Queue summary">
          <span>
            <strong>{loaderData.counts.pending}</strong> ready
          </span>
          <span>
            <strong>{loaderData.counts.email}</strong> email pending
          </span>
          <span>
            <strong>{loaderData.counts.needsInfo}</strong> needs info
          </span>
        </div>

        {loaderData.applications.length === 0 ? (
          <section className="verification-empty-state">
            <span className="chapter">Queue clear</span>
            <h2>There are no membership requests waiting for action.</h2>
          </section>
        ) : (
          <div className="application-review-layout">
            <section
              className="application-review-list"
              aria-label="Membership requests"
            >
              <div className="application-review-list-head" aria-hidden="true">
                <span>Applicant</span>
                <span>Roles</span>
                <span>Status</span>
                <span>Applied</span>
                <span />
              </div>
              {loaderData.applications.map((application) => (
                <article
                  className={`application-review-row${
                    application.id === selectedApplication?.id
                      ? " is-selected"
                      : ""
                  }`}
                  key={application.id}
                >
                  <div className="application-review-person">
                    <strong>{application.displayName}</strong>
                    <span>@{application.username}</span>
                  </div>
                  <span className="application-review-roles">
                    {application.roles || "No role selected"}
                  </span>
                  <div className="application-review-state">
                    <strong>{statusLabel(application.status)}</strong>
                    <span>
                      {application.emailVerifiedAt
                        ? "Email confirmed"
                        : "Email not confirmed"}
                    </span>
                  </div>
                  <time dateTime={application.createdAt}>
                    {new Date(application.createdAt).toLocaleDateString()}
                  </time>
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => setSelectedApplicationId(application.id)}
                    aria-pressed={application.id === selectedApplication?.id}
                  >
                    Review
                  </button>
                </article>
              ))}
            </section>

            <aside className="application-review-panel" aria-live="polite">
              {selectedApplication ? (
                <>
                  <header>
                    <span className="chapter">
                      {statusLabel(selectedApplication.status)}
                    </span>
                    <h2>{selectedApplication.displayName}</h2>
                    <p>
                      @{selectedApplication.username} · {selectedApplication.roles}
                    </p>
                  </header>

                  <dl className="application-review-signals">
                    <div>
                      <dt>Email</dt>
                      <dd>
                        {selectedApplication.emailVerifiedAt
                          ? "Confirmed"
                          : "Not confirmed"}
                      </dd>
                    </div>
                    <div>
                      <dt>Professional evidence</dt>
                      <dd>
                        {selectedApplication.evidenceUrl ? (
                          <a
                            href={selectedApplication.evidenceUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {selectedApplication.evidencePlatform ?? "Profile"} ↗
                          </a>
                        ) : (
                          "Not added yet"
                        )}
                      </dd>
                    </div>
                  </dl>

                  <section className="application-review-note">
                    <h3>Application</h3>
                    <p>{selectedApplication.applicantNote}</p>
                    {selectedApplication.status === "waitlisted" &&
                      selectedApplication.decisionNote && (
                        <>
                          <h3>Information requested</h3>
                          <p>{selectedApplication.decisionNote}</p>
                        </>
                      )}
                  </section>

                  <Form method="post" className="application-review-form">
                    <input
                      type="hidden"
                      name="applicationId"
                      value={selectedApplication.id}
                    />
                    <label>
                      Review note
                      <textarea
                        name="decisionNote"
                        maxLength={500}
                        rows={4}
                        placeholder="Optional for approval. Required when requesting information or declining."
                      />
                    </label>
                    <div className="button-row">
                      <button
                        className="button button-primary"
                        name="intent"
                        value="approve"
                        disabled={!selectedApplication.emailVerifiedAt || busy}
                      >
                        Approve &amp; next
                      </button>
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="request_info"
                        disabled={busy}
                      >
                        Request info
                      </button>
                      <button
                        className="button button-quiet application-review-decline"
                        name="intent"
                        value="decline"
                        disabled={busy}
                      >
                        Reject
                      </button>
                    </div>
                  </Form>
                </>
              ) : (
                <div className="application-review-panel-empty">
                  <span className="chapter">Review panel</span>
                  <h2>Select an applicant</h2>
                  <p>The full context will appear here without leaving the queue.</p>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
