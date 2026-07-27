import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-opportunity-operations";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  hasAdminScope,
  requireAdmin,
  requireAdminScope,
} from "~/lib/membership.server";
import {
  isVerifiedInvestorId,
  recordOpportunityAudit,
} from "~/lib/opportunity-access.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type AccessRequestRow = {
  id: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  investorUserId: string;
  investorName: string;
  reason: string;
  status: string;
  expiresAt: string | null;
  decisionNote: string;
  createdAt: string;
};

type IntroductionRow = {
  id: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  investorUserId: string;
  investorName: string;
  message: string;
  status: string;
  decisionNote: string;
  createdAt: string;
};

type UpdateRow = {
  id: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  founderUserId: string;
  title: string;
  body: string;
  visibility: string;
  status: string;
  decisionNote: string;
  createdAt: string;
};

type QuestionRow = {
  id: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  askedBy: string;
  investorName: string;
  question: string;
  answer: string;
  status: string;
  decisionNote: string;
  createdAt: string;
};

type AuditRow = {
  action: string;
  actorName: string | null;
  projectTitle: string | null;
  metadataJson: string;
  createdAt: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdmin(request, db);
  const [canManageProjects, canModerate] = await Promise.all([
    hasAdminScope(db, user.id, "projects"),
    hasAdminScope(db, user.id, "moderation"),
  ]);
  if (!canManageProjects && !canModerate)
    throw new Response("Deal Room operations permission required.", {
      status: 403,
    });

  const [accessRequests, introductions, updates, questions, audits] =
    await Promise.all([
      canManageProjects
        ? db
            .prepare(
              `SELECT drr.id, drr.project_id AS projectId,
                      pr.slug AS projectSlug, pr.title AS projectTitle,
                      drr.investor_user_id AS investorUserId,
                      p.display_name AS investorName, drr.reason, drr.status,
                      drr.expires_at AS expiresAt,
                      COALESCE(drr.decision_note, '') AS decisionNote,
                      drr.created_at AS createdAt
               FROM data_room_requests drr
               JOIN projects pr ON pr.id = drr.project_id
               JOIN opportunity_listings ol ON ol.project_id = pr.id
               JOIN profiles p ON p.user_id = drr.investor_user_id
               WHERE drr.status IN ('pending', 'approved', 'declined', 'revoked', 'expired')
               ORDER BY CASE drr.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                        drr.created_at DESC
               LIMIT 200`,
            )
            .all<AccessRequestRow>()
        : Promise.resolve({ results: [] as AccessRequestRow[] }),
      canManageProjects
        ? db
            .prepare(
              `SELECT ir.id, ir.project_id AS projectId,
                      pr.slug AS projectSlug, pr.title AS projectTitle,
                      ir.investor_user_id AS investorUserId,
                      p.display_name AS investorName, ir.message, ir.status,
                      ir.decision_note AS decisionNote,
                      ir.created_at AS createdAt
               FROM introduction_requests ir
               JOIN projects pr ON pr.id = ir.project_id
               JOIN profiles p ON p.user_id = ir.investor_user_id
               WHERE ir.status IN ('pending', 'approved', 'declined', 'completed')
               ORDER BY CASE ir.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                        ir.created_at DESC
               LIMIT 200`,
            )
            .all<IntroductionRow>()
        : Promise.resolve({ results: [] as IntroductionRow[] }),
      canManageProjects
        ? db
            .prepare(
              `SELECT ou.id, ou.project_id AS projectId,
                      pr.slug AS projectSlug, pr.title AS projectTitle,
                      pr.founder_user_id AS founderUserId,
                      ou.title, ou.body, ou.visibility, ou.status,
                      ou.decision_note AS decisionNote,
                      ou.created_at AS createdAt
               FROM opportunity_updates ou
               JOIN projects pr ON pr.id = ou.project_id
               WHERE ou.status IN ('submitted', 'published', 'declined')
               ORDER BY CASE ou.status WHEN 'submitted' THEN 0 ELSE 1 END,
                        ou.created_at DESC
               LIMIT 200`,
            )
            .all<UpdateRow>()
        : Promise.resolve({ results: [] as UpdateRow[] }),
      db
        .prepare(
          `SELECT oq.id, oq.project_id AS projectId,
                  pr.slug AS projectSlug, pr.title AS projectTitle,
                  oq.asked_by AS askedBy, p.display_name AS investorName,
                  oq.question, oq.answer, oq.status,
                  oq.decision_note AS decisionNote,
                  oq.created_at AS createdAt
           FROM opportunity_questions oq
           JOIN projects pr ON pr.id = oq.project_id
           JOIN profiles p ON p.user_id = oq.asked_by
           WHERE oq.status IN ('submitted', 'answered', 'declined')
           ORDER BY CASE oq.status WHEN 'submitted' THEN 0 ELSE 1 END,
                    oq.created_at DESC
           LIMIT 200`,
        )
        .all<QuestionRow>(),
      db
        .prepare(
          `SELECT al.action, actor.display_name AS actorName,
                  pr.title AS projectTitle, al.metadata_json AS metadataJson,
                  al.created_at AS createdAt
           FROM audit_logs al
           LEFT JOIN profiles actor ON actor.user_id = al.actor_user_id
           LEFT JOIN projects pr ON pr.id = al.subject_id
           WHERE al.subject_type = 'opportunity'
           ORDER BY al.created_at DESC
           LIMIT 100`,
        )
        .all<AuditRow>(),
    ]);

  return {
    user,
    canManageProjects,
    canModerate,
    accessRequests: accessRequests.results,
    introductions: introductions.results,
    updates: updates.results,
    questions: questions.results,
    audits: audits.results,
  };
}

async function notification(
  db: D1Database,
  userId: string,
  kind: string,
  title: string,
  body: string,
  actionUrl: string,
) {
  await db
    .prepare(
      `INSERT INTO notifications
         (id, user_id, kind, title, body, action_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), userId, kind, title, body, actionUrl)
    .run();
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const decisionNote = formText(form.get("decisionNote")).trim();
  if (decisionNote.length < 5 || decisionNote.length > 1000)
    return { error: "Add a decision note between 5 and 1,000 characters." };

  if (
    [
      "approve-access",
      "decline-access",
      "revoke-access",
      "expire-access",
    ].includes(intent)
  ) {
    const admin = await requireAdminScope(request, db, "projects");
    const requestId = formText(form.get("requestId"));
    const days = Number(formText(form.get("days")) || "30");
    if (intent === "approve-access" && ![7, 14, 30, 60, 90].includes(days))
      return { error: "Choose a supported access period." };
    const target = await db
      .prepare(
        `SELECT drr.project_id AS projectId,
                drr.investor_user_id AS investorUserId,
                pr.slug, pr.title, drr.status
         FROM data_room_requests drr
         JOIN projects pr ON pr.id = drr.project_id
         JOIN opportunity_listings ol ON ol.project_id = pr.id
         WHERE drr.id = ?`,
      )
      .bind(requestId)
      .first<{
        projectId: string;
        investorUserId: string;
        slug: string;
        title: string;
        status: string;
      }>();
    if (!target)
      throw new Response("Access request not found.", { status: 404 });
    if (
      intent === "approve-access" &&
      !(await isVerifiedInvestorId(db, target.investorUserId))
    )
      return {
        error: "Only a currently verified Investor can receive access.",
      };

    const status =
      intent === "approve-access"
        ? "approved"
        : intent === "decline-access"
          ? "declined"
          : intent === "revoke-access"
            ? "revoked"
            : "expired";
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `UPDATE data_room_requests
           SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
               decision_note = ?,
               expires_at = CASE WHEN ? = 'approved' THEN datetime('now', ?) ELSE expires_at END,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(
          status,
          admin.id,
          decisionNote,
          status,
          `+${days} days`,
          requestId,
        ),
    ];
    if (["revoked", "expired", "declined"].includes(status))
      statements.push(
        db
          .prepare(
            `UPDATE document_access_grants
             SET revoked_at = datetime('now'), revoked_by = ?,
                 updated_at = datetime('now')
             WHERE project_id = ? AND investor_user_id = ?
               AND revoked_at IS NULL`,
          )
          .bind(admin.id, target.projectId, target.investorUserId),
      );
    await db.batch(statements);
    await notification(
      db,
      target.investorUserId,
      "opportunity.access_reviewed",
      `Deal Room access ${status}`,
      `Your access request for ${target.title} is ${status}. ${decisionNote}`,
      `/deals/${target.slug}`,
    );
    await recordOpportunityAudit(
      db,
      admin.id,
      `opportunity.access_${status}`,
      target.projectId,
      { requestId, investorUserId: target.investorUserId, decisionNote, days },
    );
    return { saved: `Deal Room access marked ${status}.` };
  }

  if (intent === "publish-update" || intent === "decline-update") {
    const admin = await requireAdminScope(request, db, "projects");
    const updateId = formText(form.get("updateId"));
    const target = await db
      .prepare(
        `SELECT ou.project_id AS projectId, ou.created_by AS founderUserId,
                pr.slug, pr.title, ou.title AS updateTitle
         FROM opportunity_updates ou
         JOIN projects pr ON pr.id = ou.project_id
         WHERE ou.id = ? AND ou.status = 'submitted'`,
      )
      .bind(updateId)
      .first<{
        projectId: string;
        founderUserId: string;
        slug: string;
        title: string;
        updateTitle: string;
      }>();
    if (!target)
      throw new Response("Submitted update not found.", { status: 404 });
    const status = intent === "publish-update" ? "published" : "declined";
    await db
      .prepare(
        `UPDATE opportunity_updates
         SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
             published_at = CASE WHEN ? = 'published' THEN datetime('now') ELSE NULL END,
             decision_note = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'submitted'`,
      )
      .bind(status, admin.id, status, decisionNote, updateId)
      .run();
    await notification(
      db,
      target.founderUserId,
      "opportunity.update_reviewed",
      `Founder update ${status}`,
      `${target.updateTitle} for ${target.title} is ${status}. ${decisionNote}`,
      `/projects/${target.slug}/opportunity/manage`,
    );
    await recordOpportunityAudit(
      db,
      admin.id,
      `opportunity.update_${status}`,
      target.projectId,
      { updateId, decisionNote },
    );
    return { saved: `Founder update marked ${status}.` };
  }

  if (
    [
      "approve-introduction",
      "decline-introduction",
      "complete-introduction",
    ].includes(intent)
  ) {
    const admin = await requireAdminScope(request, db, "projects");
    const introductionId = formText(form.get("introductionId"));
    const target = await db
      .prepare(
        `SELECT ir.project_id AS projectId,
                ir.investor_user_id AS investorUserId,
                pr.slug, pr.title
         FROM introduction_requests ir
         JOIN projects pr ON pr.id = ir.project_id
         WHERE ir.id = ?`,
      )
      .bind(introductionId)
      .first<{
        projectId: string;
        investorUserId: string;
        slug: string;
        title: string;
      }>();
    if (!target)
      throw new Response("Introduction request not found.", { status: 404 });
    const status =
      intent === "approve-introduction"
        ? "approved"
        : intent === "decline-introduction"
          ? "declined"
          : "completed";
    await db
      .prepare(
        `UPDATE introduction_requests
         SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
             decision_note = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(status, admin.id, decisionNote, introductionId)
      .run();
    await notification(
      db,
      target.investorUserId,
      "opportunity.introduction_reviewed",
      `Founder introduction ${status}`,
      `Your introduction request for ${target.title} is ${status}. ${decisionNote}`,
      `/deals/${target.slug}`,
    );
    await recordOpportunityAudit(
      db,
      admin.id,
      `opportunity.introduction_${status}`,
      target.projectId,
      { introductionId, decisionNote },
    );
    return { saved: `Introduction request marked ${status}.` };
  }

  if (intent === "decline-question") {
    const admin = await requireAdmin(request, db);
    const allowed =
      (await hasAdminScope(db, admin.id, "projects")) ||
      (await hasAdminScope(db, admin.id, "moderation"));
    if (!allowed)
      throw new Response("Question moderation permission required.", {
        status: 403,
      });
    const questionId = formText(form.get("questionId"));
    const target = await db
      .prepare(
        `SELECT oq.project_id AS projectId, oq.asked_by AS askedBy,
                pr.slug, pr.title
         FROM opportunity_questions oq
         JOIN projects pr ON pr.id = oq.project_id
         WHERE oq.id = ? AND oq.status = 'submitted'`,
      )
      .bind(questionId)
      .first<{
        projectId: string;
        askedBy: string;
        slug: string;
        title: string;
      }>();
    if (!target) throw new Response("Question not found.", { status: 404 });
    await db
      .prepare(
        `UPDATE opportunity_questions
         SET status = 'declined', decision_note = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'submitted'`,
      )
      .bind(decisionNote, questionId)
      .run();
    await notification(
      db,
      target.askedBy,
      "opportunity.question_reviewed",
      "Investor question not published",
      `Your question about ${target.title} was not published. ${decisionNote}`,
      `/deals/${target.slug}`,
    );
    await recordOpportunityAudit(
      db,
      admin.id,
      "opportunity.question_declined",
      target.projectId,
      { questionId, decisionNote },
    );
    return { saved: "Investor question declined." };
  }

  throw new Response("Unsupported Deal Room operation.", { status: 400 });
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB") : "Not set";
}

export default function AdminOpportunityOperations({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const pending = useNavigation().state !== "idle";
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main
        id="main-content"
        className="admin-main opportunity-operations-main"
      >
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Deal Room operations</span>
            <h1>Control access, communications and review history.</h1>
            <p>
              Every protected action is server-authorised and written to the
              AKARI audit record. Access for one opportunity never unlocks
              another.
            </p>
          </div>
          <div className="deal-action-row">
            <Link className="button button-quiet" to="/admin/opportunities">
              Listings and verification
            </Link>
            <Link
              className="button button-quiet"
              to="/admin/opportunities/documents"
            >
              Private documents
            </Link>
          </div>
        </header>

        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success" role="status">
            {actionData.saved}
          </p>
        )}

        {loaderData.canManageProjects && (
          <section aria-labelledby="access-queue-title">
            <span className="chapter">Access queue</span>
            <h2 id="access-queue-title">Per-opportunity access requests</h2>
            <div className="application-list">
              {loaderData.accessRequests.length ? (
                loaderData.accessRequests.map((item) => (
                  <article className="application-card" key={item.id}>
                    <div>
                      <span className="chapter">{item.status}</span>
                      <h3>
                        <Link to={`/deals/${item.projectSlug}`}>
                          {item.projectTitle}
                        </Link>
                      </h3>
                      <p>{item.investorName}</p>
                      <p>{item.reason}</p>
                      <small>
                        Requested {formatDate(item.createdAt)} · Expires{" "}
                        {formatDate(item.expiresAt)}
                      </small>
                      {item.decisionNote && <p>{item.decisionNote}</p>}
                    </div>
                    <Form method="post" className="application-actions">
                      <input type="hidden" name="requestId" value={item.id} />
                      <label>
                        Access period
                        <select name="days" defaultValue="30">
                          {[7, 14, 30, 60, 90].map((days) => (
                            <option key={days} value={days}>
                              {days} days
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Decision note
                        <textarea
                          name="decisionNote"
                          minLength={5}
                          maxLength={1000}
                          required
                        />
                      </label>
                      {item.status === "pending" && (
                        <>
                          <button
                            className="button button-primary"
                            name="intent"
                            value="approve-access"
                            disabled={pending}
                          >
                            Approve access
                          </button>
                          <button
                            className="button button-quiet"
                            name="intent"
                            value="decline-access"
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {item.status === "approved" && (
                        <>
                          <button
                            className="button button-quiet"
                            name="intent"
                            value="revoke-access"
                          >
                            Revoke immediately
                          </button>
                          <button
                            className="text-button"
                            name="intent"
                            value="expire-access"
                          >
                            Mark expired
                          </button>
                        </>
                      )}
                    </Form>
                  </article>
                ))
              ) : (
                <p className="empty-state">No Deal Room access requests.</p>
              )}
            </div>
          </section>
        )}

        {loaderData.canManageProjects && (
          <section aria-labelledby="update-queue-title">
            <span className="chapter">Founder updates</span>
            <h2 id="update-queue-title">Review submitted updates</h2>
            <div className="application-list">
              {loaderData.updates.length ? (
                loaderData.updates.map((item) => (
                  <article className="application-card" key={item.id}>
                    <div>
                      <span className="chapter">
                        {item.status} · {item.visibility}
                      </span>
                      <h3>{item.title}</h3>
                      <p>{item.projectTitle}</p>
                      <p>{item.body}</p>
                      {item.decisionNote && <small>{item.decisionNote}</small>}
                    </div>
                    {item.status === "submitted" && (
                      <Form method="post" className="application-actions">
                        <input type="hidden" name="updateId" value={item.id} />
                        <label>
                          Decision note
                          <textarea
                            name="decisionNote"
                            minLength={5}
                            maxLength={1000}
                            required
                          />
                        </label>
                        <button
                          className="button button-primary"
                          name="intent"
                          value="publish-update"
                        >
                          Publish update
                        </button>
                        <button
                          className="button button-quiet"
                          name="intent"
                          value="decline-update"
                        >
                          Decline
                        </button>
                      </Form>
                    )}
                  </article>
                ))
              ) : (
                <p className="empty-state">
                  No Founder updates require review.
                </p>
              )}
            </div>
          </section>
        )}

        {loaderData.canManageProjects && (
          <section aria-labelledby="intro-queue-title">
            <span className="chapter">Introductions</span>
            <h2 id="intro-queue-title">Review Founder introduction requests</h2>
            <div className="application-list">
              {loaderData.introductions.length ? (
                loaderData.introductions.map((item) => (
                  <article className="application-card" key={item.id}>
                    <div>
                      <span className="chapter">{item.status}</span>
                      <h3>{item.projectTitle}</h3>
                      <p>{item.investorName}</p>
                      <p>{item.message}</p>
                      {item.decisionNote && <small>{item.decisionNote}</small>}
                    </div>
                    <Form method="post" className="application-actions">
                      <input
                        type="hidden"
                        name="introductionId"
                        value={item.id}
                      />
                      <label>
                        Decision note
                        <textarea
                          name="decisionNote"
                          minLength={5}
                          maxLength={1000}
                          required
                        />
                      </label>
                      {item.status === "pending" && (
                        <>
                          <button
                            className="button button-primary"
                            name="intent"
                            value="approve-introduction"
                          >
                            Approve introduction
                          </button>
                          <button
                            className="button button-quiet"
                            name="intent"
                            value="decline-introduction"
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {item.status === "approved" && (
                        <button
                          className="button button-quiet"
                          name="intent"
                          value="complete-introduction"
                        >
                          Mark completed
                        </button>
                      )}
                    </Form>
                  </article>
                ))
              ) : (
                <p className="empty-state">No introduction requests.</p>
              )}
            </div>
          </section>
        )}

        <section aria-labelledby="question-queue-title">
          <span className="chapter">Question moderation</span>
          <h2 id="question-queue-title">Authorised Investor questions</h2>
          <div className="application-list">
            {loaderData.questions.length ? (
              loaderData.questions.map((item) => (
                <article className="application-card" key={item.id}>
                  <div>
                    <span className="chapter">{item.status}</span>
                    <h3>{item.projectTitle}</h3>
                    <p>{item.investorName}</p>
                    <p>{item.question}</p>
                    {item.answer && <blockquote>{item.answer}</blockquote>}
                    {item.decisionNote && <small>{item.decisionNote}</small>}
                  </div>
                  {item.status === "submitted" && (
                    <Form method="post" className="application-actions">
                      <input type="hidden" name="questionId" value={item.id} />
                      <label>
                        Moderation note
                        <textarea
                          name="decisionNote"
                          minLength={5}
                          maxLength={1000}
                          required
                        />
                      </label>
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="decline-question"
                      >
                        Decline question
                      </button>
                    </Form>
                  )}
                </article>
              ))
            ) : (
              <p className="empty-state">No Investor questions.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="audit-title">
          <span className="chapter">Audit history</span>
          <h2 id="audit-title">Recent sensitive activity</h2>
          <div className="application-list audit-list">
            {loaderData.audits.map((item, index) => (
              <article
                className="application-card"
                key={`${item.createdAt}-${index}`}
              >
                <div>
                  <span className="chapter">{item.action}</span>
                  <h3>{item.projectTitle || "Opportunity record"}</h3>
                  <p>{item.actorName || "System or removed member"}</p>
                  <small>{formatDate(item.createdAt)}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
