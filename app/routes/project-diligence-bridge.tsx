import { redirect } from "react-router";
import type { Route } from "./+types/project-diligence-bridge";
import {
  action as legacyDiligenceAction,
} from "./project-diligence-completion";
export { default, meta } from "./project-diligence-completion";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { ndaBridgeDecision } from "~/lib/crm-nda-bridge.server";
import {
  diligenceCompleteness,
  isDiligenceCategory,
} from "~/lib/diligence-completion";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";
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
  let ndaBridge = {
    mode: "legacy" as "legacy" | "shadow" | "crm",
    source: "HOUSE_LEGACY" as
      | "HOUSE_LEGACY"
      | "HOUSE_LEGACY_SHADOW"
      | "CRM_BY_AKARI",
    mismatch: false,
    crmReason: null as string | null,
    checkedAt: null as string | null,
  };

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
    ndaBridge = {
      mode: decision.mode,
      source: decision.source,
      mismatch: decision.mismatch,
      crmReason: decision.crmStatus?.reason ?? null,
      checkedAt: decision.crmStatus?.checkedAt ?? null,
    };
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
    ndaBridge,
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
    return legacyDiligenceAction(args);
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
