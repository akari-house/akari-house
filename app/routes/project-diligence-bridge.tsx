import { redirect } from "react-router";
import type { Route } from "./+types/project-diligence-bridge";
import {
  action as legacyDiligenceAction,
  loader as legacyDiligenceLoader,
} from "./project-diligence-completion";
export { default, meta } from "./project-diligence-completion";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { ndaBridgeDecision } from "~/lib/crm-nda-bridge.server";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";
import { isDiligenceCategory } from "~/lib/diligence-completion";
import {
  isVerifiedInvestor,
  opportunityAccessStateForUserId,
} from "~/lib/opportunity-access.server";
import { userCanManageProject } from "~/lib/project-access.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader(args: Route.LoaderArgs) {
  const legacyData = await legacyDiligenceLoader(
    args as Parameters<typeof legacyDiligenceLoader>[0],
  );
  if (legacyData instanceof Response || !legacyData.isInvestor) return legacyData;

  const env = args.context.get(cloudflareContext).env;
  const decision = await ndaBridgeDecision(
    env,
    env.DB,
    legacyData.project.id,
    legacyData.user.id,
  );

  return {
    ...legacyData,
    ndaSigned: decision.signed,
    ndaBridge: {
      mode: decision.mode,
      source: decision.source,
      mismatch: decision.mismatch,
      crmReason: decision.crmStatus?.reason ?? null,
      checkedAt: decision.crmStatus?.checkedAt ?? null,
    },
  };
}

export async function action(args: Route.ActionArgs) {
  const preview = await args.request.clone().formData();
  const intent = formText(preview.get("intent"));
  if (intent !== "ask-diligence-question") {
    return legacyDiligenceAction(
      args as Parameters<typeof legacyDiligenceAction>[0],
    );
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
