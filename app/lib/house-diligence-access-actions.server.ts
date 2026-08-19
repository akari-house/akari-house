import { redirect } from "react-router";
import { requireApprovedMember } from "~/lib/auth.server";
import {
  cloudflareContext,
  type AkariCloudflareContext,
} from "~/lib/cloudflare-context";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";
import {
  isVerifiedInvestor,
  isVerifiedInvestorId,
  opportunityAccessStateForUserId,
  recordOpportunityAudit,
} from "~/lib/opportunity-access.server";
import { userCanManageProject } from "~/lib/project-access.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type HouseDiligenceAccessArgs = {
  request: Request;
  context: {
    get: (context: typeof cloudflareContext) => AkariCloudflareContext;
  };
  params: { slug: string };
};

export const houseDiligenceAccessIntents = new Set([
  "request-data-room",
  "grant-document",
  "revoke-grant",
  "approve-data-room",
  "decline-data-room",
  "revoke-data-room",
]);

/**
 * House-native permissioned diligence access actions.
 *
 * This service deliberately contains no CRM agreement, relationship,
 * commercial or workspace behavior. It exists so the canonical diligence
 * route can preserve established House form posts after the CRM-era route
 * implementation is removed.
 */
export async function houseDiligenceAccessAction(
  args: HouseDiligenceAccessArgs,
) {
  assertSameOrigin(args.request);
  const db = args.context.get(cloudflareContext).env.DB;
  await ensureDiligenceSchema(db);
  const user = await requireApprovedMember(args.request, db);
  const project = await db
    .prepare(
      `SELECT id, slug, title, founder_user_id AS founderUserId,
              COALESCE(data_room_url, '') AS dataRoomUrl
       FROM projects WHERE slug = ?`,
    )
    .bind(args.params.slug)
    .first<{
      id: string;
      slug: string;
      title: string;
      founderUserId: string;
      dataRoomUrl: string;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });

  const isFounder = await userCanManageProject(db, project.id, user.id);
  const form = await args.request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "request-data-room") {
    if (
      !user.roles.includes("investor") ||
      isFounder ||
      !(await isVerifiedInvestor(db, user))
    )
      throw new Response("Verified Investor access required.", { status: 403 });

    const reason = formText(form.get("reason")).trim();
    if (reason.length < 20 || reason.length > 800)
      return { error: "Add a request reason between 20 and 800 characters." };

    await db.batch([
      db
        .prepare(
          `INSERT INTO data_room_requests (id, project_id, investor_user_id, reason)
           VALUES (?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
        )
        .bind(crypto.randomUUID(), project.id, user.id, reason),
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'diligence.request', 'New data-room request', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          project.founderUserId,
          `${user.displayName} requested diligence access for ${project.title}.`,
          `/projects/${project.slug}/diligence`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id)
           VALUES (?, ?, 'diligence.data_room_requested', 'project', ?)`,
        )
        .bind(crypto.randomUUID(), user.id, project.id),
    ]);
    throw redirect(`/projects/${project.slug}/diligence?requested=1`);
  }

  if (!isFounder)
    throw new Response("Project owner or collaborator required.", {
      status: 403,
    });

  if (intent === "grant-document") {
    const documentId = formText(form.get("documentId"));
    const investorUserId = formText(form.get("investorUserId"));
    const days = Number(formText(form.get("days")));
    const canDownload = form.get("canDownload") === "yes" ? 1 : 0;
    if (!documentId || !investorUserId || ![7, 14, 30, 60, 90].includes(days))
      return {
        error: "Choose a document, verified Investor and access period.",
      };

    const valid = await db
      .prepare(
        `SELECT pd.approved_at AS approvedAt,
                ol.project_id AS opportunityProjectId
         FROM project_documents pd
         LEFT JOIN opportunity_listings ol ON ol.project_id = pd.project_id
         WHERE pd.id = ? AND pd.project_id = ?`,
      )
      .bind(documentId, project.id)
      .first<{
        approvedAt: string | null;
        opportunityProjectId: string | null;
      }>();
    if (!valid || !(await isVerifiedInvestorId(db, investorUserId)))
      throw new Response("Invalid diligence grant.", { status: 400 });

    if (valid.opportunityProjectId) {
      if (!valid.approvedAt)
        return {
          error: "AKARI must approve this document before it can be granted.",
        };
      if (
        (await opportunityAccessStateForUserId(
          db,
          project.id,
          investorUserId,
        )) !== "approved"
      )
        return {
          error:
            "Approve this Investor's Deal Room request before granting documents.",
        };
    }

    await db.batch([
      db
        .prepare(
          `UPDATE document_access_grants
           SET revoked_at = datetime('now'), revoked_by = ?, updated_at = datetime('now')
           WHERE project_id = ? AND document_id = ? AND investor_user_id = ?
             AND revoked_at IS NULL`,
        )
        .bind(user.id, project.id, documentId, investorUserId),
      db
        .prepare(
          `INSERT INTO document_access_grants
             (id, project_id, document_id, investor_user_id, granted_by, can_download, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))`,
        )
        .bind(
          crypto.randomUUID(),
          project.id,
          documentId,
          investorUserId,
          user.id,
          canDownload,
          `+${days} days`,
        ),
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'diligence.granted', 'Project document access granted', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          investorUserId,
          `You received time-limited diligence access for ${project.title}.`,
          `/projects/${project.slug}/diligence`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
             (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'diligence.document_granted', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          project.id,
          JSON.stringify({
            documentId,
            investorUserId,
            days,
            canDownload: Boolean(canDownload),
          }),
        ),
    ]);
    throw redirect(`/projects/${project.slug}/diligence?granted=1`);
  }

  if (intent === "revoke-grant") {
    const grantId = formText(form.get("grantId"));
    await db.batch([
      db
        .prepare(
          `UPDATE document_access_grants
           SET revoked_at = datetime('now'), revoked_by = ?, updated_at = datetime('now')
           WHERE id = ? AND project_id = ? AND revoked_at IS NULL`,
        )
        .bind(user.id, grantId, project.id),
      db
        .prepare(
          `INSERT INTO audit_logs
             (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'diligence.document_revoked', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          project.id,
          JSON.stringify({ grantId }),
        ),
    ]);
    throw redirect(`/projects/${project.slug}/diligence?revoked=1`);
  }

  if (intent === "approve-data-room" || intent === "decline-data-room") {
    const requestId = formText(form.get("requestId"));
    const note = formText(form.get("decisionNote")).trim();
    const days = Number(formText(form.get("days")) || "30");
    if (
      note.length < 5 ||
      note.length > 500 ||
      ![7, 14, 30, 60, 90].includes(days)
    )
      return { error: "Add a decision note and valid access period." };

    const target = await db
      .prepare(
        `SELECT investor_user_id AS investorUserId
         FROM data_room_requests
         WHERE id = ? AND project_id = ? AND status = 'pending'`,
      )
      .bind(requestId, project.id)
      .first<{ investorUserId: string }>();
    if (!target) throw new Response("Request not found.", { status: 404 });

    const approved = intent === "approve-data-room";
    if (approved && !(await isVerifiedInvestorId(db, target.investorUserId)))
      return {
        error: "Only a currently verified Investor can receive access.",
      };

    await db.batch([
      db
        .prepare(
          `UPDATE data_room_requests
           SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
               decision_note = ?,
               expires_at = CASE WHEN ? = 1 THEN datetime('now', ?) ELSE NULL END,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(
          approved ? "approved" : "declined",
          user.id,
          note,
          approved ? 1 : 0,
          `+${days} days`,
          requestId,
        ),
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'diligence.data_room_decision', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          target.investorUserId,
          approved ? "Data-room access approved" : "Data-room request updated",
          approved
            ? `The founder approved time-limited data-room access for ${project.title}.`
            : `The founder declined the data-room request for ${project.title}.`,
          `/projects/${project.slug}/diligence`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
             (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'diligence.data_room_decided', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          project.id,
          JSON.stringify({ requestId, approved, days }),
        ),
    ]);
    await recordOpportunityAudit(
      db,
      user.id,
      approved ? "opportunity.access_approved" : "opportunity.access_declined",
      project.id,
      { requestId, days, decisionNote: note },
    );
    throw redirect(`/projects/${project.slug}/diligence?decision=1`);
  }

  if (intent === "revoke-data-room") {
    const requestId = formText(form.get("requestId"));
    const note = formText(form.get("decisionNote")).trim();
    if (note.length < 5 || note.length > 500)
      return { error: "Add a revocation note between 5 and 500 characters." };

    const target = await db
      .prepare(
        `SELECT investor_user_id AS investorUserId
         FROM data_room_requests
         WHERE id = ? AND project_id = ? AND status = 'approved'`,
      )
      .bind(requestId, project.id)
      .first<{ investorUserId: string }>();
    if (!target)
      throw new Response("Approved request not found.", { status: 404 });

    await db.batch([
      db
        .prepare(
          `UPDATE data_room_requests
           SET status = 'revoked', reviewed_by = ?, reviewed_at = datetime('now'),
               decision_note = ?, updated_at = datetime('now')
           WHERE id = ? AND project_id = ?`,
        )
        .bind(user.id, note, requestId, project.id),
      db
        .prepare(
          `UPDATE document_access_grants
           SET revoked_at = datetime('now'), revoked_by = ?, updated_at = datetime('now')
           WHERE project_id = ? AND investor_user_id = ? AND revoked_at IS NULL`,
        )
        .bind(user.id, project.id, target.investorUserId),
      db
        .prepare(
          `INSERT INTO notifications
             (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'opportunity.access_revoked', 'Deal Room access revoked', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          target.investorUserId,
          `Access to ${project.title} was revoked. ${note}`,
          `/deals/${project.slug}`,
        ),
    ]);
    await recordOpportunityAudit(
      db,
      user.id,
      "opportunity.access_revoked",
      project.id,
      { requestId, investorUserId: target.investorUserId, decisionNote: note },
    );
    throw redirect(`/projects/${project.slug}/diligence?revoked=1`);
  }

  throw new Response("Unsupported diligence access action.", { status: 400 });
}
