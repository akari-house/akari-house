import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/opportunity-manage";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { recordOpportunityAudit } from "~/lib/opportunity-access.server";
import { requireProjectManagerBySlug } from "~/lib/project-access.server";
import { opportunitySectionDefinitions } from "~/lib/opportunity-sections";
import {
  loadOpportunitySections,
  saveOpportunitySections,
} from "~/lib/opportunity-sections.server";
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type ProjectRow = {
  id: string;
  slug: string;
  title: string;
  founderUserId: string;
};

type ListingRow = {
  status: string;
  decisionNote: string;
};

type UpdateRow = {
  id: string;
  title: string;
  body: string;
  visibility: string;
  status: string;
  decisionNote: string;
  createdAt: string;
};

type InterestRow = {
  investorName: string;
  status: string;
  message: string;
  updatedAt: string;
};

type IntroductionRow = {
  id: string;
  investorUserId: string;
  investorName: string;
  message: string;
  status: string;
  decisionNote: string;
  createdAt: string;
};

type QuestionRow = {
  id: string;
  investorName: string;
  question: string;
  answer: string;
  status: string;
  createdAt: string;
};

async function founderProject(
  db: D1Database,
  slug: string | undefined,
  userId: string,
) {
  const access = await requireProjectManagerBySlug(db, slug, userId);
  const project = await db
    .prepare(
      `SELECT id, slug, title, founder_user_id AS founderUserId
       FROM projects WHERE id = ?`,
    )
    .bind(access.projectId)
    .first<ProjectRow>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  return project;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });
  const project = await founderProject(db, params.slug, user.id);

  const [listing, sections, updates, interests, introductions, questions] =
    await Promise.all([
      db
        .prepare(
          `SELECT status, decision_note AS decisionNote
           FROM opportunity_listings WHERE project_id = ?`,
        )
        .bind(project.id)
        .first<ListingRow>(),
      loadOpportunitySections(db, project.id, {
        includeDrafts: true,
        includeConfidential: true,
      }),
      db
        .prepare(
          `SELECT id, title, body, visibility, status,
                  decision_note AS decisionNote, created_at AS createdAt
           FROM opportunity_updates
           WHERE project_id = ? AND status <> 'archived'
           ORDER BY created_at DESC`,
        )
        .bind(project.id)
        .all<UpdateRow>(),
      db
        .prepare(
          `SELECT p.display_name AS investorName, pi.status, pi.message,
                  pi.updated_at AS updatedAt
           FROM project_interests pi
           JOIN profiles p ON p.user_id = pi.investor_user_id
           WHERE pi.project_id = ?
           ORDER BY pi.updated_at DESC`,
        )
        .bind(project.id)
        .all<InterestRow>(),
      db
        .prepare(
          `SELECT ir.id, ir.investor_user_id AS investorUserId,
                  p.display_name AS investorName, ir.message, ir.status,
                  ir.decision_note AS decisionNote,
                  ir.created_at AS createdAt
           FROM introduction_requests ir
           JOIN profiles p ON p.user_id = ir.investor_user_id
           WHERE ir.project_id = ?
           ORDER BY ir.created_at DESC`,
        )
        .bind(project.id)
        .all<IntroductionRow>(),
      db
        .prepare(
          `SELECT oq.id, p.display_name AS investorName, oq.question,
                  oq.answer, oq.status, oq.created_at AS createdAt
           FROM opportunity_questions oq
           JOIN profiles p ON p.user_id = oq.asked_by
           WHERE oq.project_id = ? AND oq.status <> 'withdrawn'
           ORDER BY oq.created_at DESC`,
        )
        .bind(project.id)
        .all<QuestionRow>(),
    ]);

  return {
    user,
    project,
    listing,
    sections,
    updates: updates.results,
    interests: interests.results,
    introductions: introductions.results,
    questions: questions.results,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });
  await requireActionRateLimit(
    db,
    request,
    "opportunity-founder-operations",
    user.id,
    30,
    60,
  );
  const project = await founderProject(db, params.slug, user.id);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "save-sections" || intent === "submit-sections") {
    await saveOpportunitySections(
      db,
      project.id,
      user.id,
      form,
      intent === "submit-sections",
    );
    await recordOpportunityAudit(
      db,
      user.id,
      intent === "submit-sections"
        ? "opportunity.sections_submitted"
        : "opportunity.sections_saved",
      project.id,
    );
    throw redirect(
      `/projects/${project.slug}/opportunity/manage?saved=sections`,
    );
  }

  if (intent === "save-update" || intent === "submit-update") {
    const title = formText(form.get("title")).trim();
    const body = formText(form.get("body")).trim();
    const visibility =
      formText(form.get("visibility")) === "public" ? "public" : "confidential";
    if (title.length < 5 || title.length > 160)
      return { error: "Update titles must be between 5 and 160 characters." };
    if (body.length < 20 || body.length > 6000)
      return { error: "Update copy must be between 20 and 6,000 characters." };
    const status = intent === "submit-update" ? "submitted" : "draft";
    await db
      .prepare(
        `INSERT INTO opportunity_updates
           (id, project_id, title, body, visibility, status, created_by,
            decision_note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', datetime('now'))`,
      )
      .bind(
        crypto.randomUUID(),
        project.id,
        title,
        body,
        visibility,
        status,
        user.id,
      )
      .run();
    await recordOpportunityAudit(
      db,
      user.id,
      status === "submitted"
        ? "opportunity.update_submitted"
        : "opportunity.update_draft_saved",
      project.id,
    );
    throw redirect(`/projects/${project.slug}/opportunity/manage?saved=update`);
  }

  if (intent === "archive-update") {
    const updateId = formText(form.get("updateId"));
    const result = await db
      .prepare(
        `UPDATE opportunity_updates
         SET status = 'archived', updated_at = datetime('now')
         WHERE id = ? AND project_id = ? AND created_by = ?`,
      )
      .bind(updateId, project.id, user.id)
      .run();
    if (!result.meta.changes)
      throw new Response("Update not found.", { status: 404 });
    await recordOpportunityAudit(
      db,
      user.id,
      "opportunity.update_archived",
      project.id,
      { updateId },
    );
    throw redirect(`/projects/${project.slug}/opportunity/manage`);
  }

  if (
    intent === "approve-introduction" ||
    intent === "decline-introduction" ||
    intent === "complete-introduction"
  ) {
    const introductionId = formText(form.get("introductionId"));
    const decisionNote = formText(form.get("decisionNote")).trim();
    if (decisionNote.length < 5 || decisionNote.length > 1000)
      return { error: "Add a decision note between 5 and 1,000 characters." };
    const nextStatus =
      intent === "approve-introduction"
        ? "approved"
        : intent === "decline-introduction"
          ? "declined"
          : "completed";
    const target = await db
      .prepare(
        `SELECT investor_user_id AS investorUserId
         FROM introduction_requests
         WHERE id = ? AND project_id = ?`,
      )
      .bind(introductionId, project.id)
      .first<{ investorUserId: string }>();
    if (!target)
      throw new Response("Introduction request not found.", { status: 404 });
    await db.batch([
      db
        .prepare(
          `UPDATE introduction_requests
           SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
               decision_note = ?, updated_at = datetime('now')
           WHERE id = ? AND project_id = ?`,
        )
        .bind(nextStatus, user.id, decisionNote, introductionId, project.id),
      db
        .prepare(
          `INSERT INTO notifications
             (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'opportunity.introduction_reviewed', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          target.investorUserId,
          `Founder introduction ${nextStatus}`,
          `Your introduction request for ${project.title} is ${nextStatus}. ${decisionNote}`,
          `/deals/${project.slug}`,
        ),
    ]);
    await recordOpportunityAudit(
      db,
      user.id,
      `opportunity.introduction_${nextStatus}`,
      project.id,
      { introductionId, decisionNote },
    );
    throw redirect(`/projects/${project.slug}/opportunity/manage`);
  }

  if (intent === "withdraw-opportunity" || intent === "archive-opportunity") {
    const status = intent === "archive-opportunity" ? "archived" : "paused";
    const result = await db
      .prepare(
        `UPDATE opportunity_listings
         SET status = ?, updated_at = datetime('now')
         WHERE project_id = ? AND created_by = ?`,
      )
      .bind(status, project.id, user.id)
      .run();
    if (!result.meta.changes)
      throw new Response("Opportunity not found.", { status: 404 });
    await recordOpportunityAudit(
      db,
      user.id,
      `opportunity.${status}`,
      project.id,
    );
    throw redirect(`/projects/${project.slug}/opportunity/manage`);
  }

  throw new Response("Unsupported Founder opportunity action.", {
    status: 400,
  });
}

export default function OpportunityManage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const sectionByKey = new Map(
    loaderData.sections.map((section) => [section.sectionKey, section]),
  );
  const pending = navigation.state !== "idle";

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main
        id="main-content"
        className="admin-main opportunity-operations-main"
      >
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Founder Deal Room operations</span>
            <h1>{loaderData.project.title}</h1>
            <p>
              Prepare reviewed Deal Room sections, submit updates and manage
              permitted Investor interactions without exposing private contacts.
            </p>
          </div>
          <div className="deal-action-row">
            <Link
              className="button button-quiet"
              to={`/projects/${loaderData.project.slug}/opportunity`}
            >
              Preview settings
            </Link>
            <Link
              className="button button-quiet"
              to={`/projects/${loaderData.project.slug}/diligence`}
            >
              Document access
            </Link>
            {loaderData.listing?.status === "published" && (
              <Link
                className="button button-primary"
                to={`/deals/${loaderData.project.slug}`}
              >
                Open Deal Room
              </Link>
            )}
          </div>
        </header>

        {loaderData.listing && (
          <p className="notice applicant-notice">
            Opportunity state: <strong>{loaderData.listing.status}</strong>
            {loaderData.listing.decisionNote
              ? ` · ${loaderData.listing.decisionNote}`
              : ""}
          </p>
        )}
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <section className="admin-panel" aria-labelledby="deal-sections-title">
          <span className="chapter">Deal Room narrative</span>
          <h2 id="deal-sections-title">Structured information</h2>
          <p>
            Public sections remain part of the reviewed preview. Confidential
            sections are returned only to authorised Investors.
          </p>
          <Form method="post" className="form-stack opportunity-section-form">
            {opportunitySectionDefinitions.map((definition) => {
              const current = sectionByKey.get(definition.key);
              return (
                <fieldset key={definition.key} className="deal-section-editor">
                  <legend>{definition.title}</legend>
                  <p>{definition.description}</p>
                  {current && (
                    <small>
                      {current.status}
                      {current.decisionNote ? ` · ${current.decisionNote}` : ""}
                    </small>
                  )}
                  <label>
                    Visibility
                    <select
                      name={`section.${definition.key}.visibility`}
                      defaultValue={current?.visibility || "confidential"}
                    >
                      <option value="confidential">Confidential</option>
                      <option value="public">Approved public preview</option>
                    </select>
                  </label>
                  <label>
                    Content
                    <textarea
                      name={`section.${definition.key}.body`}
                      rows={6}
                      maxLength={8000}
                      defaultValue={current?.body || ""}
                    />
                  </label>
                </fieldset>
              );
            })}
            <div className="deal-action-row">
              <button
                className="button button-quiet"
                name="intent"
                value="save-sections"
                disabled={pending}
              >
                Save sections
              </button>
              <button
                className="button button-primary"
                name="intent"
                value="submit-sections"
                disabled={pending}
              >
                Submit sections for AKARI review
              </button>
            </div>
          </Form>
        </section>

        <section className="admin-panel" aria-labelledby="founder-update-title">
          <span className="chapter">Founder updates</span>
          <h2 id="founder-update-title">Share reviewed progress</h2>
          <Form method="post" className="form-stack">
            <label>
              Update title
              <input name="title" minLength={5} maxLength={160} required />
            </label>
            <label>
              Visibility
              <select name="visibility" defaultValue="confidential">
                <option value="confidential">Authorised Investors only</option>
                <option value="public">Approved public update</option>
              </select>
            </label>
            <label>
              Update
              <textarea name="body" minLength={20} maxLength={6000} required />
            </label>
            <div className="deal-action-row">
              <button
                className="button button-quiet"
                name="intent"
                value="save-update"
                disabled={pending}
              >
                Save draft
              </button>
              <button
                className="button button-primary"
                name="intent"
                value="submit-update"
                disabled={pending}
              >
                Submit update for review
              </button>
            </div>
          </Form>
          <div className="application-list">
            {loaderData.updates.map((update) => (
              <article className="application-card" key={update.id}>
                <div>
                  <span className="chapter">
                    {update.status} · {update.visibility}
                  </span>
                  <h3>{update.title}</h3>
                  <p>{update.body}</p>
                  {update.decisionNote && <small>{update.decisionNote}</small>}
                </div>
                <Form method="post">
                  <input type="hidden" name="updateId" value={update.id} />
                  <button
                    className="text-button"
                    name="intent"
                    value="archive-update"
                  >
                    Archive
                  </button>
                </Form>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="interest-summary-title">
          <span className="chapter">Investor signals</span>
          <h2 id="interest-summary-title">Non-binding interest summaries</h2>
          <div className="application-list">
            {loaderData.interests.length ? (
              loaderData.interests.map((interest, index) => (
                <article
                  className="application-card"
                  key={`${interest.investorName}-${index}`}
                >
                  <div>
                    <span className="chapter">{interest.status}</span>
                    <h3>{interest.investorName}</h3>
                    <p>{interest.message}</p>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-state">
                No Investor interest has been recorded.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="introduction-review-title">
          <span className="chapter">Introductions</span>
          <h2 id="introduction-review-title">Founder introduction requests</h2>
          <div className="application-list">
            {loaderData.introductions.length ? (
              loaderData.introductions.map((introduction) => (
                <article className="application-card" key={introduction.id}>
                  <div>
                    <span className="chapter">{introduction.status}</span>
                    <h3>{introduction.investorName}</h3>
                    <p>{introduction.message}</p>
                    {introduction.decisionNote && (
                      <small>{introduction.decisionNote}</small>
                    )}
                  </div>
                  <Form method="post" className="application-actions">
                    <input
                      type="hidden"
                      name="introductionId"
                      value={introduction.id}
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
                    {introduction.status === "pending" && (
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
                    {introduction.status === "approved" && (
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
              <p className="empty-state">No introduction requests yet.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="question-summary-title">
          <span className="chapter">Questions</span>
          <h2 id="question-summary-title">Authorised Investor questions</h2>
          <div className="application-list">
            {loaderData.questions.length ? (
              loaderData.questions.map((question) => (
                <article className="application-card" key={question.id}>
                  <div>
                    <span className="chapter">{question.status}</span>
                    <h3>{question.investorName}</h3>
                    <p>{question.question}</p>
                    {question.answer && (
                      <blockquote>{question.answer}</blockquote>
                    )}
                  </div>
                  {!question.answer && (
                    <Link to={`/deals/${loaderData.project.slug}`}>
                      Respond in the authorised Deal Room
                    </Link>
                  )}
                </article>
              ))
            ) : (
              <p className="empty-state">No Investor questions yet.</p>
            )}
          </div>
        </section>

        {loaderData.listing && (
          <section className="admin-panel danger-zone">
            <span className="chapter">Availability</span>
            <h2>Withdraw or archive this opportunity</h2>
            <p>
              Withdrawing pauses new access. Archiving removes the opportunity
              from active discovery while preserving its audit history.
            </p>
            <div className="deal-action-row">
              <Form method="post">
                <button
                  className="button button-quiet"
                  name="intent"
                  value="withdraw-opportunity"
                >
                  Withdraw from discovery
                </button>
              </Form>
              <Form method="post">
                <button
                  className="text-button"
                  name="intent"
                  value="archive-opportunity"
                >
                  Archive opportunity
                </button>
              </Form>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
