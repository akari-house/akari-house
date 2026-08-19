import { redirect } from "react-router";
import { requireApprovedMember } from "~/lib/auth.server";
import {
  cloudflareContext,
  type AkariCloudflareContext,
} from "~/lib/cloudflare-context";
import {
  houseDiligenceAccessAction,
  houseDiligenceAccessIntents,
} from "~/lib/house-diligence-access-actions.server";
import { isDiligenceCategory } from "~/lib/diligence-completion";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";
import { recordOpportunityAudit } from "~/lib/opportunity-access.server";
import { userCanManageProject } from "~/lib/project-access.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type HouseDiligenceActionArgs = {
  request: Request;
  context: {
    get: (context: typeof cloudflareContext) => AkariCloudflareContext;
  };
  params: { slug: string };
};

/**
 * House-native diligence actions that are unrelated to NDA provenance.
 *
 * NDA authorization is intentionally owned by the registered diligence route,
 * which calls the narrow external verification bridge. Keeping these actions
 * here prevents AKARI House product flows from depending on the retired
 * CRM-era agreement route implementation.
 */
export async function houseDiligenceAction(args: HouseDiligenceActionArgs) {
  const preview = await args.request.clone().formData();
  const previewIntent = formText(preview.get("intent"));
  if (houseDiligenceAccessIntents.has(previewIntent)) {
    return houseDiligenceAccessAction(args);
  }

  assertSameOrigin(args.request);
  const db = args.context.get(cloudflareContext).env.DB;
  await ensureDiligenceSchema(db);
  const user = await requireApprovedMember(args.request, db);
  const project = await db
    .prepare(`SELECT id, slug, title FROM projects WHERE slug = ?`)
    .bind(args.params.slug)
    .first<{ id: string; slug: string; title: string }>();
  if (!project) throw new Response("Project not found.", { status: 404 });

  const isFounder = await userCanManageProject(db, project.id, user.id);
  const form = await args.request.formData();
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
      { ndaRequired: Boolean(ndaRequired) },
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
