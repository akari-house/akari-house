import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/deal-room";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser, requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  isVerifiedInvestor,
  opportunityAccessState,
  recordOpportunityAudit,
  recordOpportunityView,
  type OpportunityAccessState,
} from "~/lib/opportunity-access.server";
import { hasAdminScope } from "~/lib/membership.server";
import { isOpportunitySchemaUnavailable } from "~/lib/opportunity-schema.server";
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type PreviewRow = {
  projectId: string;
  founderUserId: string;
  slug: string;
  title: string;
  summary: string;
  publicSummary: string;
  publicHighlights: string;
  riskSummary: string;
  stage: string;
  sector: string;
  geography: string;
  fundingInstrument: string;
  raiseMinimum: number | null;
  raiseMaximum: number | null;
  raiseCurrency: string;
  minimumParticipation: number | null;
  tractionStage: string;
  closingAt: string | null;
  accessMode: "verified_investors" | "approved_only";
  founderName: string;
  founderUsername: string;
};

type DocumentRow = {
  id: string;
  title: string;
  category: string;
  contentType: string;
  byteSize: number;
};

type UpdateRow = {
  id: string;
  title: string;
  body: string;
  visibility: "public" | "confidential";
  publishedAt: string | null;
  createdAt: string;
};

type QuestionRow = {
  id: string;
  question: string;
  answer: string;
  status: string;
  askerName: string;
  askedBy: string;
  createdAt: string;
};

export const meta: Route.MetaFunction = () => [
  { title: "Selected opportunity | AKARI House" },
  {
    name: "description",
    content: "An approved opportunity preview inside AKARI House.",
  },
];

function money(value: number | null, currency: string) {
  if (value === null) return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-GB")}`;
  }
}

function accessMessage(state: OpportunityAccessState) {
  switch (state) {
    case "approved":
      return "Private room access is active.";
    case "requested":
      return "Your private room request is awaiting review.";
    case "verification_required":
      return "Investor verification is required before private access can be requested.";
    case "request_required":
      return "This opportunity requires a separate private room approval.";
    case "declined":
      return "Your private room request was declined.";
    case "revoked":
      return "Your private room access has been revoked.";
    case "expired":
      return "Your private room access has expired.";
    case "restricted":
      return "Private room access is not available for this account.";
    default:
      return "Only approved preview information is visible.";
  }
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  try {
    await db.prepare("SELECT 1 FROM opportunity_listings LIMIT 1").first();
  } catch (error) {
    if (!isOpportunitySchemaUnavailable(error)) throw error;
    const project = await db
      .prepare(
        `SELECT slug FROM projects
         WHERE slug = ? AND status = 'published'
         LIMIT 1`,
      )
      .bind(params.dealSlug)
      .first<{ slug: string }>();
    if (project) throw redirect(`/projects/${project.slug}`);
    throw new Response("Opportunity not found.", { status: 404 });
  }
  const preview = await db
    .prepare(
      `SELECT pr.id AS projectId, pr.founder_user_id AS founderUserId,
              pr.slug, pr.title, pr.summary,
              ol.public_summary AS publicSummary,
              ol.public_highlights AS publicHighlights,
              ol.risk_summary AS riskSummary,
              pr.stage, ol.sector, ol.geography,
              ol.funding_instrument AS fundingInstrument,
              ol.raise_minimum AS raiseMinimum,
              ol.raise_maximum AS raiseMaximum,
              ol.raise_currency AS raiseCurrency,
              ol.minimum_participation AS minimumParticipation,
              ol.traction_stage AS tractionStage,
              ol.closing_at AS closingAt,
              ol.access_mode AS accessMode,
              p.display_name AS founderName,
              u.username AS founderUsername
       FROM opportunity_listings ol
       JOIN projects pr ON pr.id = ol.project_id
       JOIN users u ON u.id = pr.founder_user_id
       JOIN profiles p ON p.user_id = pr.founder_user_id
       WHERE pr.slug = ?
         AND pr.status = 'published'
         AND ol.status = 'published'`,
    )
    .bind(params.dealSlug)
    .first<PreviewRow>();
  if (!preview) throw new Response("Opportunity not found.", { status: 404 });

  const admin = user ? await hasAdminScope(db, user.id, "projects") : false;
  const founder = user?.id === preview.founderUserId;
  const investorState =
    founder || admin
      ? "approved"
      : await opportunityAccessState(db, preview.projectId, user);
  const fullAccess = investorState === "approved";

  const publicUpdates = await db
    .prepare(
      `SELECT id, title, body, visibility, published_at AS publishedAt,
              created_at AS createdAt
       FROM opportunity_updates
       WHERE project_id = ? AND status = 'published' AND visibility = 'public'
       ORDER BY COALESCE(published_at, created_at) DESC`,
    )
    .bind(preview.projectId)
    .all<UpdateRow>();

  let documents: DocumentRow[] = [];
  let privateUpdates: UpdateRow[] = [];
  let questions: QuestionRow[] = [];
  if (fullAccess && user) {
    const documentResult =
      founder || admin
        ? await db
            .prepare(
              `SELECT id, title, category, content_type AS contentType,
                    byte_size AS byteSize
             FROM project_documents
             WHERE project_id = ? AND approved_at IS NOT NULL
             ORDER BY created_at DESC`,
            )
            .bind(preview.projectId)
            .all<DocumentRow>()
        : await db
            .prepare(
              `SELECT pd.id, pd.title, pd.category,
                    pd.content_type AS contentType, pd.byte_size AS byteSize
             FROM project_documents pd
             JOIN document_access_grants dag
               ON dag.document_id = pd.id AND dag.project_id = pd.project_id
              AND dag.investor_user_id = ?
              AND dag.revoked_at IS NULL
              AND dag.starts_at <= datetime('now')
              AND dag.expires_at > datetime('now')
             WHERE pd.project_id = ? AND pd.approved_at IS NOT NULL
             ORDER BY pd.created_at DESC`,
            )
            .bind(user.id, preview.projectId)
            .all<DocumentRow>();
    documents = documentResult.results;

    const updateResult = await db
      .prepare(
        `SELECT id, title, body, visibility, published_at AS publishedAt,
                created_at AS createdAt
         FROM opportunity_updates
         WHERE project_id = ? AND status = 'published'
           AND visibility = 'confidential'
         ORDER BY COALESCE(published_at, created_at) DESC`,
      )
      .bind(preview.projectId)
      .all<UpdateRow>();
    privateUpdates = updateResult.results;

    const questionResult =
      founder || admin
        ? await db
            .prepare(
              `SELECT oq.id, oq.question, oq.answer, oq.status,
                    oq.asked_by AS askedBy,
                    p.display_name AS askerName,
                    oq.created_at AS createdAt
             FROM opportunity_questions oq
             JOIN profiles p ON p.user_id = oq.asked_by
             WHERE oq.project_id = ? AND oq.status <> 'withdrawn'
             ORDER BY oq.created_at DESC`,
            )
            .bind(preview.projectId)
            .all<QuestionRow>()
        : await db
            .prepare(
              `SELECT oq.id, oq.question, oq.answer, oq.status,
                    oq.asked_by AS askedBy,
                    p.display_name AS askerName,
                    oq.created_at AS createdAt
             FROM opportunity_questions oq
             JOIN profiles p ON p.user_id = oq.asked_by
             WHERE oq.project_id = ? AND oq.asked_by = ?
               AND oq.status <> 'withdrawn'
             ORDER BY oq.created_at DESC`,
            )
            .bind(preview.projectId, user.id)
            .all<QuestionRow>();
    questions = questionResult.results;

    await recordOpportunityView(db, user.id, preview.projectId);
  }

  const [userState, ownInterest, introduction] = user
    ? await Promise.all([
        db
          .prepare(
            `SELECT saved_at AS savedAt, passed_at AS passedAt
             FROM opportunity_user_states
             WHERE project_id = ? AND user_id = ?`,
          )
          .bind(preview.projectId, user.id)
          .first<{ savedAt: string | null; passedAt: string | null }>(),
        db
          .prepare(
            `SELECT status FROM project_interests
             WHERE project_id = ? AND investor_user_id = ?`,
          )
          .bind(preview.projectId, user.id)
          .first<{ status: string }>(),
        db
          .prepare(
            `SELECT status FROM introduction_requests
             WHERE project_id = ? AND investor_user_id = ?
             ORDER BY created_at DESC LIMIT 1`,
          )
          .bind(preview.projectId, user.id)
          .first<{ status: string }>(),
      ])
    : [null, null, null];

  return {
    user,
    preview,
    admin,
    founder,
    verifiedInvestor: await isVerifiedInvestor(db, user),
    accessState: investorState,
    fullAccess,
    documents,
    publicUpdates: publicUpdates.results,
    privateUpdates,
    questions,
    userState,
    ownInterest,
    introduction,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  try {
    await db.prepare("SELECT 1 FROM opportunity_listings LIMIT 1").first();
  } catch (error) {
    if (isOpportunitySchemaUnavailable(error))
      throw new Response("The private deal room is still being activated.", {
        status: 503,
      });
    throw error;
  }
  await requireActionRateLimit(
    db,
    request,
    "opportunity-room",
    user.id,
    30,
    60,
  );
  const listing = await db
    .prepare(
      `SELECT pr.id AS projectId, pr.founder_user_id AS founderUserId,
              pr.title, ol.access_mode AS accessMode
       FROM opportunity_listings ol
       JOIN projects pr ON pr.id = ol.project_id
       WHERE pr.slug = ? AND pr.status = 'published'
         AND ol.status = 'published'`,
    )
    .bind(params.dealSlug)
    .first<{
      projectId: string;
      founderUserId: string;
      title: string;
      accessMode: "verified_investors" | "approved_only";
    }>();
  if (!listing) throw new Response("Opportunity not found.", { status: 404 });
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const verifiedInvestor = await isVerifiedInvestor(db, user);
  const isFounder = user.id === listing.founderUserId;
  const isAdmin =
    (await hasAdminScope(db, user.id, "projects")) ||
    (await hasAdminScope(db, user.id, "moderation"));

  if (["save", "pass", "clear-state"].includes(intent)) {
    if (!verifiedInvestor)
      throw new Response("Verified Investor access required.", { status: 403 });
    if (intent === "clear-state")
      await db
        .prepare(
          `DELETE FROM opportunity_user_states
           WHERE project_id = ? AND user_id = ?`,
        )
        .bind(listing.projectId, user.id)
        .run();
    else
      await db
        .prepare(
          `INSERT INTO opportunity_user_states
             (project_id, user_id, saved_at, passed_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(project_id, user_id) DO UPDATE SET
             saved_at = excluded.saved_at, passed_at = excluded.passed_at,
             updated_at = datetime('now')`,
        )
        .bind(
          listing.projectId,
          user.id,
          intent === "save" ? new Date().toISOString() : null,
          intent === "pass" ? new Date().toISOString() : null,
        )
        .run();
    await recordOpportunityAudit(
      db,
      user.id,
      `opportunity.${intent.replace("-", "_")}`,
      listing.projectId,
    );
    throw redirect(`/deals/${params.dealSlug}`);
  }

  if (intent === "request-access") {
    if (!verifiedInvestor)
      throw new Response("Verified Investor access required.", { status: 403 });
    if (user.id === listing.founderUserId)
      throw new Response("Project owners already control this room.", {
        status: 400,
      });
    if (listing.accessMode !== "approved_only")
      throw new Response("A separate request is not required.", {
        status: 400,
      });
    const reason = formText(form.get("reason")).trim();
    if (reason.length < 20 || reason.length > 1200)
      return { error: "Add an access reason between 20 and 1,200 characters." };
    const existing = await db
      .prepare(
        `SELECT id, status FROM data_room_requests
         WHERE project_id = ? AND investor_user_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(listing.projectId, user.id)
      .first<{ id: string; status: string }>();
    if (existing && ["pending", "approved"].includes(existing.status))
      return { error: "An active room request already exists." };
    await db.batch([
      db
        .prepare(
          `INSERT INTO data_room_requests
           (id, project_id, investor_user_id, reason, status, updated_at)
           VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
        )
        .bind(crypto.randomUUID(), listing.projectId, user.id, reason),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'opportunity.access_requested',
                   'Private room access requested', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          listing.founderUserId,
          `${user.displayName} requested access to ${listing.title}.`,
          `/projects/${params.dealSlug}/diligence`,
        ),
    ]);
    await recordOpportunityAudit(
      db,
      user.id,
      "opportunity.access_requested",
      listing.projectId,
    );
    throw redirect(`/deals/${params.dealSlug}`);
  }

  if (intent === "withdraw-access") {
    await db
      .prepare(
        `UPDATE data_room_requests
         SET status = 'revoked', updated_at = datetime('now')
         WHERE project_id = ? AND investor_user_id = ? AND status = 'pending'`,
      )
      .bind(listing.projectId, user.id)
      .run();
    await recordOpportunityAudit(
      db,
      user.id,
      "opportunity.access_withdrawn",
      listing.projectId,
    );
    throw redirect(`/deals/${params.dealSlug}`);
  }

  if (intent === "interest" || intent === "withdraw-interest") {
    if (!verifiedInvestor)
      throw new Response("Verified Investor access required.", { status: 403 });
    if (intent === "withdraw-interest") {
      await db
        .prepare(
          `UPDATE project_interests SET status = 'withdrawn',
           updated_at = datetime('now')
           WHERE project_id = ? AND investor_user_id = ?`,
        )
        .bind(listing.projectId, user.id)
        .run();
      await recordOpportunityAudit(
        db,
        user.id,
        "opportunity.interest_withdrawn",
        listing.projectId,
      );
      throw redirect(`/deals/${params.dealSlug}`);
    }
    const message = formText(form.get("message")).trim();
    if (message.length < 10 || message.length > 800)
      return {
        error: "Add a non-binding interest note between 10 and 800 characters.",
      };
    await db.batch([
      db
        .prepare(
          `INSERT INTO project_interests
             (id, project_id, investor_user_id, message, status, updated_at)
           VALUES (?, ?, ?, ?, 'active', datetime('now'))
           ON CONFLICT(project_id, investor_user_id) DO UPDATE SET
             message = excluded.message, status = 'active',
             updated_at = datetime('now')`,
        )
        .bind(crypto.randomUUID(), listing.projectId, user.id, message),
      db
        .prepare(
          `INSERT INTO notifications
             (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'opportunity.interest', 'New non-binding interest', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          listing.founderUserId,
          `${user.displayName} registered non-binding interest in ${listing.title}.`,
          `/deals/${params.dealSlug}`,
        ),
    ]);
    await recordOpportunityAudit(
      db,
      user.id,
      "opportunity.interest_registered",
      listing.projectId,
    );
    throw redirect(`/deals/${params.dealSlug}`);
  }

  if (intent === "request-introduction") {
    if (!verifiedInvestor)
      throw new Response("Verified Investor access required.", { status: 403 });
    if (
      (await opportunityAccessState(db, listing.projectId, user)) !== "approved"
    )
      throw new Response("Private room approval required.", { status: 404 });
    const message = formText(form.get("message")).trim();
    if (message.length < 10 || message.length > 800)
      return {
        error: "Add an introduction note between 10 and 800 characters.",
      };
    await db.batch([
      db
        .prepare(
          `INSERT INTO introduction_requests
             (id, project_id, investor_user_id, message, status, updated_at)
           VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
        )
        .bind(crypto.randomUUID(), listing.projectId, user.id, message),
      db
        .prepare(
          `INSERT INTO notifications
             (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'opportunity.introduction_requested',
                   'Founder introduction requested', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          listing.founderUserId,
          `${user.displayName} requested an introduction for ${listing.title}.`,
          `/deals/${params.dealSlug}`,
        ),
    ]);
    await recordOpportunityAudit(
      db,
      user.id,
      "opportunity.introduction_requested",
      listing.projectId,
    );
    throw redirect(`/deals/${params.dealSlug}`);
  }

  if (intent === "ask-question") {
    if (!verifiedInvestor)
      throw new Response("Verified Investor access required.", { status: 403 });
    if (
      (await opportunityAccessState(db, listing.projectId, user)) !== "approved"
    )
      throw new Response("Private room approval required.", { status: 404 });
    const question = formText(form.get("question")).trim();
    if (question.length < 10 || question.length > 1200)
      return { error: "Add a question between 10 and 1,200 characters." };
    await db.batch([
      db
        .prepare(
          `INSERT INTO opportunity_questions
           (id, project_id, asked_by, question, status)
           VALUES (?, ?, ?, ?, 'submitted')`,
        )
        .bind(crypto.randomUUID(), listing.projectId, user.id, question),
      db
        .prepare(
          `INSERT INTO notifications
             (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'opportunity.question_submitted',
                   'New Investor question', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          listing.founderUserId,
          `${user.displayName} submitted a question about ${listing.title}.`,
          `/deals/${params.dealSlug}`,
        ),
    ]);
    await recordOpportunityAudit(
      db,
      user.id,
      "opportunity.question_submitted",
      listing.projectId,
    );
    throw redirect(`/deals/${params.dealSlug}`);
  }

  if (intent === "answer-question") {
    if (!isFounder && !isAdmin)
      throw new Response("Project owner or administrator required.", {
        status: 403,
      });
    const questionId = formText(form.get("questionId"));
    const answer = formText(form.get("answer")).trim();
    if (answer.length < 10 || answer.length > 2400)
      return { error: "Add an answer between 10 and 2,400 characters." };
    const questionOwner = await db
      .prepare(
        `SELECT asked_by AS askedBy
         FROM opportunity_questions
         WHERE id = ? AND project_id = ? AND status = 'submitted'`,
      )
      .bind(questionId, listing.projectId)
      .first<{ askedBy: string }>();
    if (!questionOwner)
      throw new Response("Question not found.", { status: 404 });
    const updated = await db
      .prepare(
        `UPDATE opportunity_questions
         SET answer = ?, status = 'answered', answered_by = ?,
             answered_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND project_id = ? AND status = 'submitted'`,
      )
      .bind(answer, user.id, questionId, listing.projectId)
      .run();
    if (!updated.meta.changes)
      throw new Response("Question not found.", { status: 404 });
    await db
      .prepare(
        `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'opportunity.question_answered',
                 'Your Investor question was answered', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        questionOwner.askedBy,
        `A response is available for your question about ${listing.title}.`,
        `/deals/${params.dealSlug}`,
      )
      .run();
    await recordOpportunityAudit(
      db,
      user.id,
      "opportunity.question_answered",
      listing.projectId,
      { questionId },
    );
    throw redirect(`/deals/${params.dealSlug}`);
  }

  throw new Response("Unsupported action.", { status: 400 });
}

export default function DealRoom({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { preview } = loaderData;
  const navigation = useNavigation();
  const range = [
    money(preview.raiseMinimum, preview.raiseCurrency),
    money(preview.raiseMaximum, preview.raiseCurrency),
  ].filter(Boolean);
  const accessRequestable =
    loaderData.verifiedInvestor &&
    loaderData.accessState === "request_required";

  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="deal-room-main">
        <header className="deal-room-hero">
          <div>
            <span className="chapter">Approved opportunity preview</span>
            <h1>{preview.title}</h1>
            <p>{preview.publicSummary || preview.summary}</p>
            <p>
              Shared by{" "}
              <Link to={`/profiles/${preview.founderUsername}`}>
                {preview.founderName}
              </Link>
            </p>
          </div>
          <aside className="deal-access-card">
            <span className={`status-pill status-${loaderData.accessState}`}>
              {loaderData.accessState.replaceAll("_", " ")}
            </span>
            <h2>Access status</h2>
            <p>{accessMessage(loaderData.accessState)}</p>
            {accessRequestable && (
              <Form method="post" className="form-stack">
                <label>
                  Why is private access relevant?
                  <textarea
                    name="reason"
                    minLength={20}
                    maxLength={1200}
                    required
                  />
                </label>
                <button
                  className="button button-primary"
                  name="intent"
                  value="request-access"
                  disabled={navigation.state !== "idle"}
                >
                  Request private room access
                </button>
              </Form>
            )}
            {loaderData.accessState === "requested" && (
              <Form method="post">
                <button
                  className="text-button"
                  name="intent"
                  value="withdraw-access"
                >
                  Withdraw request
                </button>
              </Form>
            )}
            {loaderData.founder && (
              <Link
                className="button button-quiet"
                to={`/projects/${preview.slug}/diligence`}
              >
                Manage room access
              </Link>
            )}
          </aside>
        </header>

        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <section
          className="deal-preview-grid"
          aria-label="Opportunity overview"
        >
          <article>
            <span className="eyebrow">Sector</span>
            <strong>{preview.sector || "Not specified"}</strong>
          </article>
          <article>
            <span className="eyebrow">Stage</span>
            <strong>{preview.stage.replace("_", " ")}</strong>
          </article>
          <article>
            <span className="eyebrow">Geography</span>
            <strong>{preview.geography || "Not specified"}</strong>
          </article>
          <article>
            <span className="eyebrow">Instrument</span>
            <strong>{preview.fundingInstrument.replace("_", " ")}</strong>
          </article>
          {range.length > 0 && (
            <article>
              <span className="eyebrow">Raise range</span>
              <strong>{range.join(" - ")}</strong>
            </article>
          )}
          {preview.minimumParticipation !== null && (
            <article>
              <span className="eyebrow">Minimum participation</span>
              <strong>
                {money(preview.minimumParticipation, preview.raiseCurrency)}
              </strong>
            </article>
          )}
          {preview.closingAt && (
            <article>
              <span className="eyebrow">Current timeline</span>
              <strong>
                {new Date(preview.closingAt).toLocaleDateString("en-GB")}
              </strong>
            </article>
          )}
        </section>

        <section className="deal-public-story">
          <div>
            <span className="chapter">Preview</span>
            <h2>What has been approved for discovery</h2>
          </div>
          <p>{preview.publicHighlights || preview.summary}</p>
          {preview.riskSummary && (
            <aside className="deal-risk-note">
              <strong>Risk information</strong>
              <p>{preview.riskSummary}</p>
            </aside>
          )}
        </section>

        {loaderData.publicUpdates.length > 0 && (
          <section className="deal-updates">
            <span className="chapter">Public updates</span>
            <h2>What has changed</h2>
            {loaderData.publicUpdates.map((update) => (
              <article key={update.id}>
                <h3>{update.title}</h3>
                <p>{update.body}</p>
                <small>
                  {new Date(
                    update.publishedAt || update.createdAt,
                  ).toLocaleDateString("en-GB")}
                </small>
              </article>
            ))}
          </section>
        )}

        {loaderData.verifiedInvestor && !loaderData.founder && (
          <section className="deal-investor-actions">
            <div>
              <span className="chapter">Your decision space</span>
              <h2>Keep a private record of your next step</h2>
            </div>
            <div className="deal-action-row">
              <Form method="post">
                <button
                  className="button button-quiet"
                  name="intent"
                  value={loaderData.userState?.savedAt ? "clear-state" : "save"}
                >
                  {loaderData.userState?.savedAt ? "Saved" : "Save opportunity"}
                </button>
              </Form>
              <Form method="post">
                <button
                  className="button button-quiet"
                  name="intent"
                  value={
                    loaderData.userState?.passedAt ? "clear-state" : "pass"
                  }
                >
                  {loaderData.userState?.passedAt ? "Passed" : "Pass for now"}
                </button>
              </Form>
            </div>
            <Form method="post" className="form-stack">
              <label>
                Non-binding interest note
                <textarea
                  name="message"
                  minLength={10}
                  maxLength={800}
                  required
                />
              </label>
              <button
                className="button button-primary"
                name="intent"
                value="interest"
              >
                {loaderData.ownInterest?.status === "active"
                  ? "Update non-binding interest"
                  : "Register non-binding interest"}
              </button>
              {loaderData.ownInterest?.status === "active" && (
                <button
                  className="text-button"
                  name="intent"
                  value="withdraw-interest"
                >
                  Withdraw interest
                </button>
              )}
            </Form>
          </section>
        )}

        {loaderData.fullAccess && (
          <section
            className="private-deal-room"
            aria-labelledby="private-room-title"
          >
            <header>
              <span className="chapter">Private room</span>
              <h2 id="private-room-title">Authorised diligence space</h2>
              <p>
                Content in this section is returned only after server-side
                access checks. Links remain private and access can be revoked
                immediately.
              </p>
            </header>

            <div className="private-room-grid">
              <article>
                <h3>Approved documents</h3>
                {loaderData.documents.length ? (
                  <ul className="document-list">
                    {loaderData.documents.map((document) => (
                      <li key={document.id}>
                        <Link
                          to={`/projects/${preview.slug}/documents/${document.id}`}
                        >
                          {document.title}
                        </Link>
                        <span>{document.category}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No documents are currently authorised for this account.</p>
                )}
              </article>

              <article>
                <h3>Confidential updates</h3>
                {loaderData.privateUpdates.length ? (
                  loaderData.privateUpdates.map((update) => (
                    <div key={update.id}>
                      <strong>{update.title}</strong>
                      <p>{update.body}</p>
                    </div>
                  ))
                ) : (
                  <p>No confidential updates have been published.</p>
                )}
              </article>
            </div>

            {!loaderData.founder && !loaderData.admin && (
              <div className="private-room-actions">
                <Form method="post" className="form-stack">
                  <label>
                    Ask the Founder a question
                    <textarea
                      name="question"
                      minLength={10}
                      maxLength={1200}
                      required
                    />
                  </label>
                  <button
                    className="button button-primary"
                    name="intent"
                    value="ask-question"
                  >
                    Submit question
                  </button>
                </Form>
                <Form method="post" className="form-stack">
                  <label>
                    Founder introduction note
                    <textarea
                      name="message"
                      minLength={10}
                      maxLength={800}
                      required
                    />
                  </label>
                  <button
                    className="button button-quiet"
                    name="intent"
                    value="request-introduction"
                    disabled={loaderData.introduction?.status === "pending"}
                  >
                    {loaderData.introduction?.status === "pending"
                      ? "Introduction requested"
                      : "Request Founder introduction"}
                  </button>
                </Form>
              </div>
            )}

            {loaderData.questions.length > 0 && (
              <div className="deal-questions">
                <h3>Questions and answers</h3>
                {loaderData.questions.map((question) => (
                  <article key={question.id}>
                    <strong>{question.askerName}</strong>
                    <p>{question.question}</p>
                    {question.answer ? (
                      <blockquote>{question.answer}</blockquote>
                    ) : loaderData.founder || loaderData.admin ? (
                      <Form method="post" className="form-stack">
                        <input
                          type="hidden"
                          name="questionId"
                          value={question.id}
                        />
                        <label>
                          Answer
                          <textarea
                            name="answer"
                            minLength={10}
                            maxLength={2400}
                            required
                          />
                        </label>
                        <button
                          className="button button-primary"
                          name="intent"
                          value="answer-question"
                        >
                          Publish answer to this authorised participant
                        </button>
                      </Form>
                    ) : (
                      <small>Awaiting a response.</small>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <aside className="deal-legal-note">
          <strong>Important</strong>
          <p>
            AKARI does not provide investment, financial, legal or tax advice.
            Review and verification do not constitute endorsement. Early-stage
            and digital-asset opportunities can involve substantial loss,
            illiquidity and regulatory risk.
          </p>
        </aside>
      </main>
      <PublicFooter />
    </div>
  );
}
