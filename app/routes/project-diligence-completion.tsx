import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-diligence-completion";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  diligenceCategories,
  diligenceCategoryDescriptions,
  diligenceCategoryLabels,
  diligenceCompleteness,
  isDiligenceCategory,
} from "~/lib/diligence-completion";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";
import {
  isVerifiedInvestor,
  opportunityAccessStateForUserId,
  recordOpportunityAudit,
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

async function signedNdaForInvestor(
  db: D1Database,
  projectId: string,
  investorUserId: string,
) {
  const row = await db
    .prepare(
      `SELECT 1 AS ok
       FROM agreement_records ar
       JOIN users u
         ON lower(trim(u.email)) = lower(trim(ar.counterparty_email))
       WHERE ar.project_id = ? AND u.id = ?
         AND ar.agreement_type = 'nda' AND ar.status = 'signed'
         AND (ar.expires_at IS NULL OR ar.expires_at > datetime('now'))
       LIMIT 1`,
    )
    .bind(projectId, investorUserId)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

export const meta: Route.MetaFunction = () => [
  { title: "Project Diligence | AKARI House" },
  {
    name: "description",
    content:
      "Founder diligence completeness, document versions and controlled Investor Q&A.",
  },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
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
    ndaSigned = await signedNdaForInvestor(db, project.id, user.id);
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

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  await ensureDiligenceSchema(db);
  const user = await requireApprovedMember(request, db);
  const project = await db
    .prepare(`SELECT id, slug, title FROM projects WHERE slug = ?`)
    .bind(params.slug)
    .first<{ id: string; slug: string; title: string }>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  const isFounder = await userCanManageProject(db, project.id, user.id);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "set-nda-policy") {
    if (!isFounder)
      throw new Response("Project manager access required.", { status: 403 });
    const ndaRequired = form.get("ndaRequired") === "yes" ? 1 : 0;
    await db
      .prepare(
        `INSERT INTO project_diligence_settings
           (project_id, nda_required, updated_by)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           nda_required = excluded.nda_required,
           updated_by = excluded.updated_by,
           updated_at = datetime('now')`,
      )
      .bind(project.id, ndaRequired, user.id)
      .run();
    await recordOpportunityAudit(
      db,
      user.id,
      "diligence.nda_policy_updated",
      project.id,
      {
        ndaRequired: Boolean(ndaRequired),
      },
    );
    throw redirect(`/projects/${project.slug}/diligence?saved=nda`);
  }

  if (intent === "classify-document") {
    if (!isFounder)
      throw new Response("Project manager access required.", { status: 403 });
    const documentId = formText(form.get("documentId"));
    const category = formText(form.get("category"));
    if (!documentId || !isDiligenceCategory(category))
      return { error: "Choose a valid document and diligence category." };
    const document = await db
      .prepare(
        `SELECT id FROM project_documents WHERE id = ? AND project_id = ?`,
      )
      .bind(documentId, project.id)
      .first<{ id: string }>();
    if (!document) throw new Response("Document not found.", { status: 404 });
    await db.batch([
      db
        .prepare(
          `UPDATE project_documents
           SET category = ?, approved_at = NULL, approved_by = NULL
           WHERE id = ? AND project_id = ?`,
        )
        .bind(category, documentId, project.id),
      db
        .prepare(
          `INSERT INTO audit_logs
             (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'diligence.document_classified', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          project.id,
          JSON.stringify({ documentId, category }),
        ),
    ]);
    throw redirect(`/projects/${project.slug}/diligence?saved=category`);
  }

  if (intent === "link-document-version") {
    if (!isFounder)
      throw new Response("Project manager access required.", { status: 403 });
    const previousId = formText(form.get("previousDocumentId"));
    const nextId = formText(form.get("nextDocumentId"));
    const versionNote = formText(form.get("versionNote")).trim();
    if (
      !previousId ||
      !nextId ||
      previousId === nextId ||
      versionNote.length > 1000
    )
      return {
        error: "Choose two different documents and an optional version note.",
      };
    const rows = await db
      .prepare(
        `SELECT pd.id, COALESCE(pdv.series_id, pd.id) AS seriesId,
                COALESCE(pdv.version_number, 1) AS versionNumber,
                COALESCE(pdv.is_current, 1) AS isCurrent
         FROM project_documents pd
         LEFT JOIN project_document_versions pdv ON pdv.document_id = pd.id
         WHERE pd.project_id = ? AND pd.id IN (?, ?)`,
      )
      .bind(project.id, previousId, nextId)
      .all<{
        id: string;
        seriesId: string;
        versionNumber: number;
        isCurrent: number;
      }>();
    if (rows.results.length !== 2)
      throw new Response("Document not found.", { status: 404 });
    const previous = rows.results.find((row) => row.id === previousId);
    const next = rows.results.find((row) => row.id === nextId);
    if (!previous?.isCurrent || !next?.isCurrent)
      return {
        error: "Only current documents can be linked into a new version.",
      };
    const nextVersion = previous.versionNumber + 1;
    await db.batch([
      db
        .prepare(
          `INSERT INTO project_document_versions
             (document_id, project_id, series_id, version_number, is_current)
           VALUES (?, ?, ?, ?, 1)
           ON CONFLICT(document_id) DO NOTHING`,
        )
        .bind(
          previous.id,
          project.id,
          previous.seriesId,
          previous.versionNumber,
        ),
      db
        .prepare(
          `UPDATE project_document_versions
           SET is_current = 0 WHERE document_id = ? AND project_id = ?`,
        )
        .bind(previous.id, project.id),
      db
        .prepare(
          `UPDATE project_document_versions
           SET series_id = ?, version_number = ?, supersedes_document_id = ?,
               is_current = 1, version_note = ?
           WHERE document_id = ? AND project_id = ?`,
        )
        .bind(
          previous.seriesId,
          nextVersion,
          previous.id,
          versionNote,
          next.id,
          project.id,
        ),
      db
        .prepare(
          `UPDATE document_access_grants
           SET revoked_at = datetime('now'), revoked_by = ?, updated_at = datetime('now')
           WHERE project_id = ? AND document_id = ? AND revoked_at IS NULL`,
        )
        .bind(user.id, project.id, previous.id),
      db
        .prepare(
          `INSERT INTO audit_logs
             (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'diligence.document_version_linked', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          project.id,
          JSON.stringify({ previousId, nextId, versionNumber: nextVersion }),
        ),
    ]);
    throw redirect(`/projects/${project.slug}/diligence?saved=version`);
  }

  if (intent === "ask-diligence-question") {
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
    if (
      setting?.ndaRequired &&
      !(await signedNdaForInvestor(db, project.id, user.id))
    )
      return {
        error:
          "A current signed NDA reference is required before diligence Q&A can begin.",
      };
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

  if (intent === "answer-diligence-question") {
    if (!isFounder)
      throw new Response("Project manager access required.", { status: 403 });
    const questionId = formText(form.get("questionId"));
    const answer = formText(form.get("answer")).trim();
    const documentId = formText(form.get("documentId"));
    if (!questionId || answer.length < 5 || answer.length > 4000)
      return { error: "Add an answer between 5 and 4,000 characters." };
    if (documentId) {
      const document = await db
        .prepare(
          `SELECT pd.id
           FROM project_documents pd
           LEFT JOIN project_document_versions pdv ON pdv.document_id = pd.id
           WHERE pd.id = ? AND pd.project_id = ?
             AND COALESCE(pdv.is_current, 1) = 1`,
        )
        .bind(documentId, project.id)
        .first<{ id: string }>();
      if (!document) return { error: "Choose a current project document." };
    }
    const question = await db
      .prepare(
        `SELECT id FROM opportunity_questions
         WHERE id = ? AND project_id = ? AND status = 'submitted'`,
      )
      .bind(questionId, project.id)
      .first<{ id: string }>();
    if (!question)
      throw new Response("Open question not found.", { status: 404 });
    await db.batch([
      db
        .prepare(
          `UPDATE opportunity_questions
           SET answer = ?, status = 'answered', answered_by = ?,
               answered_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ? AND project_id = ?`,
        )
        .bind(answer, user.id, questionId, project.id),
      db
        .prepare(
          `INSERT INTO opportunity_question_documents
             (question_id, project_id, requested_category, document_id, updated_at)
           VALUES (?, ?, 'other', ?, datetime('now'))
           ON CONFLICT(question_id) DO UPDATE SET
             document_id = excluded.document_id,
             updated_at = datetime('now')`,
        )
        .bind(questionId, project.id, documentId || null),
    ]);
    throw redirect(`/projects/${project.slug}/diligence?question=answered`);
  }

  if (intent === "resolve-diligence-question") {
    if (isFounder || !user.roles.includes("investor"))
      throw new Response("Investor access required.", { status: 403 });
    const questionId = formText(form.get("questionId"));
    const question = await db
      .prepare(
        `SELECT id FROM opportunity_questions
         WHERE id = ? AND project_id = ? AND asked_by = ? AND status = 'answered'`,
      )
      .bind(questionId, project.id, user.id)
      .first<{ id: string }>();
    if (!question)
      throw new Response("Answered question not found.", { status: 404 });
    await db
      .prepare(
        `INSERT INTO opportunity_question_documents
           (question_id, project_id, requested_category, resolved_at, resolved_by)
         VALUES (?, ?, 'other', datetime('now'), ?)
         ON CONFLICT(question_id) DO UPDATE SET
           resolved_at = datetime('now'), resolved_by = excluded.resolved_by,
           updated_at = datetime('now')`,
      )
      .bind(questionId, project.id, user.id)
      .run();
    throw redirect(`/projects/${project.slug}/diligence?question=resolved`);
  }

  throw new Response("Unsupported diligence action.", { status: 400 });
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
            <span className="eyebrow">R72 · Data Room & Diligence</span>
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
          <h2>NDA dependency</h2>
          {loaderData.isFounder ? (
            <Form method="post" className="form-stack">
              <label className="inline-choice">
                <input
                  type="checkbox"
                  name="ndaRequired"
                  value="yes"
                  defaultChecked={loaderData.ndaRequired}
                />
                Require a current signed external NDA record before Investor
                diligence Q&A.
              </label>
              <p className="form-hint">
                NDA records remain external legal references in AKARI Agreement
                Tracking. AKARI does not draft or sign the agreement.
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
                  ? "A current signed NDA reference is on record for your access."
                  : "This Project requires a current signed NDA reference before diligence Q&A."
                : "This Project does not require an NDA reference in AKARI for diligence Q&A."}
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
