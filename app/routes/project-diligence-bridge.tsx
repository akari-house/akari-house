import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-diligence-bridge";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { ndaBridgeDecision } from "~/lib/crm-nda-bridge.server";
import {
  diligenceCategories,
  diligenceCategoryDescriptions,
  diligenceCategoryLabels,
  diligenceCompleteness,
  isDiligenceCategory,
} from "~/lib/diligence-completion";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";
import { houseDiligenceAction } from "~/lib/house-diligence-actions.server";
import {
  isVerifiedInvestor,
  opportunityAccessStateForUserId,
} from "~/lib/opportunity-access.server";
import { userCanManageProject } from "~/lib/project-access.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type DocumentRow = {
  id: string;
  title: string;
  category: string;
  visibility: string;
  approvedAt: string | null;
  createdAt: string;
  seriesId: string;
  versionNumber: number;
  supersedesDocumentId: string | null;
  isCurrent: number;
  versionNote: string;
};

type QuestionRow = {
  id: string;
  question: string;
  answer: string;
  status: string;
  askedBy: string;
  askerName: string;
  askerUsername: string;
  requestedCategory: string;
  documentId: string | null;
  documentTitle: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const meta: Route.MetaFunction = () => [
  { title: "Project Diligence | AKARI House" },
  {
    name: "description",
    content:
      "Founder diligence completeness, document versions and controlled Investor Q&A.",
  },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareContext).env;
  const db = env.DB;
  await ensureDiligenceSchema(db);
  const user = await requireApprovedMember(request, db);
  const project = await db
    .prepare(
      `SELECT pr.id, pr.slug, pr.title, pr.founder_user_id AS founderUserId,
              COALESCE(fp.token_relevant, 0) AS tokenRelevant
       FROM projects pr
       LEFT JOIN project_fundraising_profiles fp ON fp.project_id = pr.id
       WHERE pr.slug = ?`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      slug: string;
      title: string;
      founderUserId: string;
      tokenRelevant: number;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });

  const isFounder = await userCanManageProject(db, project.id, user.id);
  const isInvestor = user.roles.includes("investor") && !isFounder;
  if (!isFounder && !isInvestor)
    throw new Response("Founder or Investor access required.", { status: 403 });
  if (isInvestor && !(await isVerifiedInvestor(db, user)))
    throw new Response("Diligence room not found.", { status: 404 });

  const [documentsResult, settings, accessCounts] = await Promise.all([
    db
      .prepare(
        `SELECT pd.id, pd.title, pd.category, pd.visibility,
                pd.approved_at AS approvedAt, pd.created_at AS createdAt,
                COALESCE(pdv.series_id, pd.id) AS seriesId,
                COALESCE(pdv.version_number, 1) AS versionNumber,
                pdv.supersedes_document_id AS supersedesDocumentId,
                COALESCE(pdv.is_current, 1) AS isCurrent,
                COALESCE(pdv.version_note, '') AS versionNote
         FROM project_documents pd
         LEFT JOIN project_document_versions pdv ON pdv.document_id = pd.id
         WHERE pd.project_id = ?
         ORDER BY COALESCE(pdv.is_current, 1) DESC, pd.created_at DESC`,
      )
      .bind(project.id)
      .all<DocumentRow>(),
    db
      .prepare(
        `SELECT COALESCE(nda_required, 0) AS ndaRequired
         FROM project_diligence_settings WHERE project_id = ?`,
      )
      .bind(project.id)
      .first<{ ndaRequired: number }>(),
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM data_room_requests
             WHERE project_id = ? AND status = 'pending') AS pendingRequests,
           (SELECT COUNT(*) FROM document_access_grants
             WHERE project_id = ? AND revoked_at IS NULL
               AND expires_at > datetime('now')) AS activeGrants,
           (SELECT COUNT(*) FROM document_access_logs
             WHERE project_id = ?) AS accessEvents`,
      )
      .bind(project.id, project.id, project.id)
      .first<{
        pendingRequests: number;
        activeGrants: number;
        accessEvents: number;
      }>(),
  ]);

  const documents = documentsResult.results;
  const currentDocuments = documents.filter((document) => document.isCurrent);
  const completeness = diligenceCompleteness(
    currentDocuments.map((document) => document.category),
    Boolean(project.tokenRelevant),
  );

  const questionQuery = isFounder
    ? db
        .prepare(
          `SELECT oq.id, oq.question, oq.answer, oq.status,
                  oq.asked_by AS askedBy,
                  COALESCE(p.display_name, u.username) AS askerName,
                  u.username AS askerUsername,
                  COALESCE(oqd.requested_category, 'other') AS requestedCategory,
                  oqd.document_id AS documentId, pd.title AS documentTitle,
                  oqd.due_at AS dueAt, oqd.resolved_at AS resolvedAt,
                  oq.created_at AS createdAt, oq.updated_at AS updatedAt
           FROM opportunity_questions oq
           JOIN users u ON u.id = oq.asked_by
           LEFT JOIN profiles p ON p.user_id = u.id
           LEFT JOIN opportunity_question_documents oqd ON oqd.question_id = oq.id
           LEFT JOIN project_documents pd ON pd.id = oqd.document_id
           WHERE oq.project_id = ?
           ORDER BY CASE WHEN oqd.resolved_at IS NULL THEN 0 ELSE 1 END,
                    oq.created_at DESC`,
        )
        .bind(project.id)
    : db
        .prepare(
          `SELECT oq.id, oq.question, oq.answer, oq.status,
                  oq.asked_by AS askedBy,
                  COALESCE(p.display_name, u.username) AS askerName,
                  u.username AS askerUsername,
                  COALESCE(oqd.requested_category, 'other') AS requestedCategory,
                  oqd.document_id AS documentId, pd.title AS documentTitle,
                  oqd.due_at AS dueAt, oqd.resolved_at AS resolvedAt,
                  oq.created_at AS createdAt, oq.updated_at AS updatedAt
           FROM opportunity_questions oq
           JOIN users u ON u.id = oq.asked_by
           LEFT JOIN profiles p ON p.user_id = u.id
           LEFT JOIN opportunity_question_documents oqd ON oqd.question_id = oq.id
           LEFT JOIN project_documents pd ON pd.id = oqd.document_id
           WHERE oq.project_id = ? AND oq.asked_by = ?
           ORDER BY CASE WHEN oqd.resolved_at IS NULL THEN 0 ELSE 1 END,
                    oq.created_at DESC`,
        )
        .bind(project.id, user.id);
  const questions = await questionQuery.all<QuestionRow>();

  let investorAccess = false;
  let ndaSigned = false;
  if (isInvestor) {
    const ownRoom = await db
      .prepare(
        `SELECT status, expires_at AS expiresAt
         FROM data_room_requests
         WHERE project_id = ? AND investor_user_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(project.id, user.id)
      .first<{ status: string; expiresAt: string | null }>();
    investorAccess =
      (ownRoom?.status === "approved" &&
        (!ownRoom.expiresAt || Date.parse(ownRoom.expiresAt) > Date.now())) ||
      (await opportunityAccessStateForUserId(db, project.id, user.id)) ===
        "approved";

    const decision = await ndaBridgeDecision(env, db, project.id, user.id);
    ndaSigned = decision.signed;
  }

  return {
    user,
    project,
    isFounder,
    isInvestor,
    documents,
    currentDocuments,
    questions: questions.results,
    completeness,
    ndaRequired: Boolean(settings?.ndaRequired),
    ndaSigned,
    investorAccess,
    accessCounts: accessCounts ?? {
      pendingRequests: 0,
      activeGrants: 0,
      accessEvents: 0,
    },
  };
}

export async function action(args: Route.ActionArgs) {
  const preview = await args.request.clone().formData();
  const intent = formText(preview.get("intent"));
  if (intent !== "ask-diligence-question") {
    return houseDiligenceAction(args);
  }

  assertSameOrigin(args.request);
  const env = args.context.get(cloudflareContext).env;
  const db = env.DB;
  await ensureDiligenceSchema(db);
  const user = await requireApprovedMember(args.request, db);
  const project = await db
    .prepare(`SELECT id, slug, title FROM projects WHERE slug = ?`)
    .bind(args.params.slug)
    .first<{ id: string; slug: string; title: string }>();
  if (!project) throw new Response("Project not found.", { status: 404 });

  const isFounder = await userCanManageProject(db, project.id, user.id);
  if (
    isFounder ||
    !user.roles.includes("investor") ||
    !(await isVerifiedInvestor(db, user))
  )
    throw new Response("Verified Investor access required.", { status: 403 });

  const room = await db
    .prepare(
      `SELECT status, expires_at AS expiresAt
       FROM data_room_requests
       WHERE project_id = ? AND investor_user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(project.id, user.id)
    .first<{ status: string; expiresAt: string | null }>();
  const hasAccess =
    (room?.status === "approved" &&
      (!room.expiresAt || Date.parse(room.expiresAt) > Date.now())) ||
    (await opportunityAccessStateForUserId(db, project.id, user.id)) ===
      "approved";
  if (!hasAccess)
    return {
      error:
        "Approved Deal Room or data-room access is required before asking diligence questions.",
    };

  const setting = await db
    .prepare(
      `SELECT COALESCE(nda_required, 0) AS ndaRequired
       FROM project_diligence_settings WHERE project_id = ?`,
    )
    .bind(project.id)
    .first<{ ndaRequired: number }>();
  if (setting?.ndaRequired) {
    const decision = await ndaBridgeDecision(env, db, project.id, user.id);
    if (!decision.signed)
      return {
        error:
          "A current signed NDA reference is required before diligence Q&A can begin.",
      };
  }

  const form = await args.request.formData();
  const question = formText(form.get("question")).trim();
  const requestedCategory = formText(form.get("requestedCategory"));
  if (
    question.length < 10 ||
    question.length > 2000 ||
    !isDiligenceCategory(requestedCategory)
  )
    return {
      error:
        "Add a diligence question between 10 and 2,000 characters and choose a category.",
    };

  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO opportunity_questions
           (id, project_id, asked_by, question)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(id, project.id, user.id, question),
    db
      .prepare(
        `INSERT INTO opportunity_question_documents
           (question_id, project_id, requested_category)
         VALUES (?, ?, ?)`,
      )
      .bind(id, project.id, requestedCategory),
    db
      .prepare(
        `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'diligence.question_submitted', 'project', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        project.id,
        JSON.stringify({ questionId: id, requestedCategory }),
      ),
  ]);

  throw redirect(`/projects/${project.slug}/diligence?question=sent`);
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

export default function ProjectDiligenceCompletion({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  const currentIds = new Set(
    loaderData.currentDocuments.map((item) => item.id),
  );
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Data Room & Diligence</span>
            <h1>{loaderData.project.title}</h1>
            <p>
              Complete institutional diligence without creating a second data
              room. Documents, access controls and Investor Q&A remain attached
              to this Project.
            </p>
          </div>
          <div className="application-actions">
            <Link
              className="button button-primary"
              to={`/projects/${loaderData.project.slug}/diligence/access`}
            >
              Trusted access
            </Link>
            <Link
              className="button button-quiet"
              to={`/projects/${loaderData.project.slug}`}
            >
              Project
            </Link>
          </div>
        </header>

        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <section className="admin-panel">
          <span className="chapter">Institutional checklist</span>
          <h2>{loaderData.completeness.percentage}% complete</h2>
          <p>
            {loaderData.completeness.complete} of{" "}
            {loaderData.completeness.total} required diligence categories
            currently have a current document.
          </p>
          <div className="application-list">
            {loaderData.completeness.required.map((category) => {
              const missing =
                loaderData.completeness.missing.includes(category);
              return (
                <article className="application-card" key={category}>
                  <div>
                    <span className="chapter">
                      {missing ? "missing" : "provided"}
                    </span>
                    <h3>{diligenceCategoryLabels[category]}</h3>
                    <p>{diligenceCategoryDescriptions[category]}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="admin-panel">
          <span className="chapter">Access governance</span>
          <h2>External NDA verification</h2>
          {loaderData.isFounder ? (
            <Form method="post" className="form-stack">
              <label className="inline-choice">
                <input
                  type="checkbox"
                  name="ndaRequired"
                  value="yes"
                  defaultChecked={loaderData.ndaRequired}
                />
                Require a current verified external NDA before Investor
                diligence Q&A.
              </label>
              <p className="form-hint">
                AKARI House only checks whether a current external NDA has been
                verified. Agreements are handled outside the House.
              </p>
              <button
                className="button button-primary"
                name="intent"
                value="set-nda-policy"
                disabled={pending}
              >
                Save NDA policy
              </button>
            </Form>
          ) : (
            <p>
              {loaderData.ndaRequired
                ? loaderData.ndaSigned
                  ? "A current external NDA has been verified for your access."
                  : "This Project requires a current verified external NDA before diligence Q&A."
                : "This Project does not require an external NDA check for diligence Q&A."}
            </p>
          )}
          <p>
            Pending room requests: {loaderData.accessCounts.pendingRequests} ·
            Active document grants: {loaderData.accessCounts.activeGrants} ·
            Logged access events: {loaderData.accessCounts.accessEvents}
          </p>
        </section>

        {loaderData.isFounder && (
          <>
            <section className="admin-panel">
              <span className="chapter">Current documents</span>
              <h2>Classify diligence material</h2>
              <p>
                Upload source files in the existing Project editor, then
                classify them here. Changing a category clears any prior AKARI
                document approval so the material can be reviewed again.
              </p>
              <Link
                className="button button-quiet"
                to={`/projects/${loaderData.project.slug}/edit`}
              >
                Upload in Project editor
              </Link>
              <div className="application-list">
                {loaderData.currentDocuments.map((document) => (
                  <article className="application-card" key={document.id}>
                    <div>
                      <span className="chapter">
                        v{document.versionNumber} · {document.category}
                      </span>
                      <h3>{document.title}</h3>
                      <small>
                        {document.approvedAt
                          ? "AKARI reviewed"
                          : "Review pending / not required yet"}
                      </small>
                    </div>
                    <Form method="post" className="application-actions">
                      <input
                        type="hidden"
                        name="documentId"
                        value={document.id}
                      />
                      <label>
                        Category
                        <select
                          name="category"
                          defaultValue={
                            diligenceCategories.includes(
                              document.category as never,
                            )
                              ? document.category
                              : "corporate"
                          }
                        >
                          {diligenceCategories.map((category) => (
                            <option key={category} value={category}>
                              {diligenceCategoryLabels[category]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="classify-document"
                        disabled={pending}
                      >
                        Save category
                      </button>
                    </Form>
                  </article>
                ))}
                {!loaderData.currentDocuments.length && (
                  <p>No AKARI project documents have been uploaded yet.</p>
                )}
              </div>
            </section>

            <section className="admin-panel">
              <span className="chapter">Document versions</span>
              <h2>Link a replacement as the next version</h2>
              <p>
                Upload the replacement as a normal Project document first.
                Linking it below preserves both files, makes the replacement
                current and automatically revokes active grants to the
                superseded version.
              </p>
              {loaderData.currentDocuments.length >= 2 ? (
                <Form method="post" className="form-stack">
                  <label>
                    Superseded document
                    <select name="previousDocumentId" required>
                      <option value="">Choose current document</option>
                      {loaderData.currentDocuments.map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.title} · v{document.versionNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Replacement document
                    <select name="nextDocumentId" required>
                      <option value="">Choose uploaded replacement</option>
                      {loaderData.currentDocuments.map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Version note
                    <textarea
                      name="versionNote"
                      maxLength={1000}
                      placeholder="What changed in this version?"
                    />
                  </label>
                  <button
                    className="button button-primary"
                    name="intent"
                    value="link-document-version"
                    disabled={pending}
                  >
                    Make replacement current
                  </button>
                </Form>
              ) : (
                <p>
                  Upload at least two documents before linking a replacement
                  version.
                </p>
              )}
              <div className="application-list">
                {loaderData.documents
                  .filter((document) => !currentIds.has(document.id))
                  .map((document) => (
                    <article className="application-card" key={document.id}>
                      <div>
                        <span className="chapter">
                          historical · v{document.versionNumber}
                        </span>
                        <h3>{document.title}</h3>
                        <p>
                          {document.versionNote || "No version note recorded."}
                        </p>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          </>
        )}

        <section className="admin-panel">
          <span className="chapter">Diligence requests</span>
          <h2>Investor questions → Founder answers → supporting document</h2>
          {loaderData.isInvestor &&
            (loaderData.investorAccess ? (
              <Form method="post" className="form-stack">
                <label>
                  Category
                  <select name="requestedCategory" defaultValue="financials">
                    {diligenceCategories.map((category) => (
                      <option key={category} value={category}>
                        {diligenceCategoryLabels[category]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Diligence question or document request
                  <textarea
                    name="question"
                    minLength={10}
                    maxLength={2000}
                    required
                  />
                </label>
                <button
                  className="button button-primary"
                  name="intent"
                  value="ask-diligence-question"
                  disabled={
                    pending || (loaderData.ndaRequired && !loaderData.ndaSigned)
                  }
                >
                  Submit diligence request
                </button>
              </Form>
            ) : (
              <p>
                Approved Deal Room or data-room access is required before
                diligence Q&A.
              </p>
            ))}
          <div className="application-list">
            {loaderData.questions.map((item) => (
              <article className="application-card" key={item.id}>
                <div>
                  <span className="chapter">
                    {item.resolvedAt ? "resolved" : item.status} ·{" "}
                    {item.requestedCategory}
                  </span>
                  <h3>{item.question}</h3>
                  <p>
                    Asked by {item.askerName} (@{item.askerUsername})
                  </p>
                  {item.answer && (
                    <p>
                      <strong>Founder answer:</strong> {item.answer}
                    </p>
                  )}
                  {item.documentTitle && (
                    <p>
                      <strong>Supporting document:</strong> {item.documentTitle}
                    </p>
                  )}
                  <small>
                    Opened {formatDate(item.createdAt)}
                    {item.resolvedAt
                      ? ` · Resolved ${formatDate(item.resolvedAt)}`
                      : ""}
                  </small>
                </div>
                {loaderData.isFounder && item.status === "submitted" && (
                  <Form method="post" className="form-stack">
                    <input type="hidden" name="questionId" value={item.id} />
                    <label>
                      Answer
                      <textarea
                        name="answer"
                        minLength={5}
                        maxLength={4000}
                        required
                      />
                    </label>
                    <label>
                      Supporting current document
                      <select name="documentId" defaultValue="">
                        <option value="">No document</option>
                        {loaderData.currentDocuments.map((document) => (
                          <option key={document.id} value={document.id}>
                            {document.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button button-primary"
                      name="intent"
                      value="answer-diligence-question"
                      disabled={pending}
                    >
                      Answer request
                    </button>
                  </Form>
                )}
                {loaderData.isInvestor &&
                  item.status === "answered" &&
                  !item.resolvedAt && (
                    <Form method="post">
                      <input type="hidden" name="questionId" value={item.id} />
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="resolve-diligence-question"
                        disabled={pending}
                      >
                        Mark resolved
                      </button>
                    </Form>
                  )}
              </article>
            ))}
            {!loaderData.questions.length && (
              <p>No diligence questions have been recorded.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
