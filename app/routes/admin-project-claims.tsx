import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin-project-claims";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";
import {
  projectClaimStatusLabel,
  projectRelationshipLabel,
} from "~/lib/project-relationships";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type ClaimView = "queue" | "history";

type ProjectClaimRow = {
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  canonicalOwnerId: string;
  userId: string;
  username: string;
  displayName: string;
  relationshipType: string;
  claimStatus: string;
  evidenceUrl: string;
  evidenceNote: string;
  decisionNote: string;
  claimedAt: string;
  reviewedAt: string | null;
  updatedAt: string;
};

const PAGE_SIZE = 50;
const managementRelationships = new Set([
  "founder",
  "cofounder",
  "authorized_representative",
]);

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "projects");
  const url = new URL(request.url);
  const view: ClaimView =
    url.searchParams.get("view") === "history" ? "history" : "queue";
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  );
  const statusClause =
    view === "queue"
      ? "rel.claim_status = 'pending'"
      : "rel.claim_status IN ('verified', 'disputed', 'revoked')";

  const count = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM project_relationships rel
       WHERE ${statusClause}`,
    )
    .first<{ total: number }>();
  const total = Number(count?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const claims = await db
    .prepare(
      `SELECT rel.project_id AS projectId,
              pr.slug AS projectSlug,
              pr.title AS projectTitle,
              pr.founder_user_id AS canonicalOwnerId,
              rel.user_id AS userId,
              u.username,
              p.display_name AS displayName,
              rel.relationship_type AS relationshipType,
              rel.claim_status AS claimStatus,
              rel.evidence_url AS evidenceUrl,
              rel.evidence_note AS evidenceNote,
              rel.decision_note AS decisionNote,
              rel.claimed_at AS claimedAt,
              rel.reviewed_at AS reviewedAt,
              rel.updated_at AS updatedAt
       FROM project_relationships rel
       JOIN projects pr ON pr.id = rel.project_id
       JOIN users u ON u.id = rel.user_id
       JOIN profiles p ON p.user_id = rel.user_id
       WHERE ${statusClause}
       ORDER BY rel.updated_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(PAGE_SIZE, offset)
    .all<ProjectClaimRow>();

  return {
    user,
    claims: claims.results,
    view,
    page: currentPage,
    total,
    totalPages,
    pageSize: PAGE_SIZE,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdminScope(request, db, "projects");
  const form = await request.formData();
  const projectId = formText(form.get("projectId"));
  const userId = formText(form.get("userId"));
  const intent = formText(form.get("intent"));
  const suppliedNote = formText(form.get("decisionNote")).trim();
  const allowedIntents = [
    "verify",
    "verify_next",
    "hold",
    "decline",
    "revoke",
  ];

  if (!projectId || !userId || !allowedIntents.includes(intent))
    return { error: "Choose a valid project relationship decision." };

  const claim = await db
    .prepare(
      `SELECT rel.relationship_type AS relationshipType,
              rel.claim_status AS claimStatus,
              pr.title AS projectTitle,
              pr.slug AS projectSlug,
              pr.founder_user_id AS canonicalOwnerId
       FROM project_relationships rel
       JOIN projects pr ON pr.id = rel.project_id
       WHERE rel.project_id = ? AND rel.user_id = ?`,
    )
    .bind(projectId, userId)
    .first<{
      relationshipType: string;
      claimStatus: string;
      projectTitle: string;
      projectSlug: string;
      canonicalOwnerId: string;
    }>();
  if (!claim) return { error: "That project relationship no longer exists." };

  const isVerify = intent === "verify" || intent === "verify_next";
  if (intent === "revoke") {
    if (claim.claimStatus !== "verified")
      return { error: "Only a verified relationship can be revoked." };
  } else if (claim.claimStatus !== "pending") {
    return { error: "That project claim is no longer waiting for review." };
  }

  if (intent === "hold" && suppliedNote.length < 10)
    return {
      error: "Add a short note explaining what information the Founder should provide.",
    };
  if (suppliedNote.length > 500)
    return { error: "Keep the decision note under 500 characters." };

  const decisionNote =
    suppliedNote ||
    (isVerify
      ? `AKARI verified the ${projectRelationshipLabel(claim.relationshipType).toLowerCase()} relationship.`
      : intent === "hold"
        ? "AKARI needs more information before verifying this project relationship."
        : intent === "revoke"
          ? "AKARI revoked this previously verified project relationship."
          : "AKARI could not verify this project relationship from the supplied evidence.");
  const status = isVerify
    ? "verified"
    : intent === "hold"
      ? "pending"
      : "revoked";

  const statements = [
    db
      .prepare(
        `UPDATE project_relationships
         SET claim_status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
             decision_note = ?, updated_at = datetime('now')
         WHERE project_id = ? AND user_id = ?`,
      )
      .bind(status, admin.id, decisionNote, projectId, userId),
    db
      .prepare(
        `INSERT INTO notifications
         (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'project.relationship', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        `${claim.projectTitle} relationship updated`,
        isVerify
          ? `AKARI verified your ${projectRelationshipLabel(claim.relationshipType)} relationship with ${claim.projectTitle}.`
          : intent === "hold"
            ? `AKARI needs more information before verifying your relationship with ${claim.projectTitle}. Open your Project claim desk to update the evidence.`
            : intent === "revoke"
              ? `AKARI revoked your previously verified relationship with ${claim.projectTitle}.`
              : `AKARI could not verify your relationship with ${claim.projectTitle} from the supplied evidence.`,
        intent === "hold" ? "/projects/claim" : `/projects/${claim.projectSlug}`,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'project.relationship_decision', 'project', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        projectId,
        JSON.stringify({
          claimantUserId: userId,
          relationshipType: claim.relationshipType,
          intent,
          status,
          decisionNote,
        }),
      ),
  ];

  const grantsManagerAccess =
    isVerify &&
    claim.canonicalOwnerId !== userId &&
    managementRelationships.has(claim.relationshipType);
  const removesManagerAccess =
    intent === "revoke" &&
    claim.canonicalOwnerId !== userId &&
    managementRelationships.has(claim.relationshipType);

  if (grantsManagerAccess)
    statements.splice(
      1,
      0,
      db
        .prepare(
          `INSERT INTO project_collaborators
           (project_id, user_id, access_level, granted_by)
           VALUES (?, ?, 'manager', ?)
           ON CONFLICT(project_id, user_id) DO UPDATE SET
             access_level = 'manager',
             granted_by = excluded.granted_by,
             updated_at = datetime('now')`,
        )
        .bind(projectId, userId, admin.id),
    );

  if (removesManagerAccess)
    statements.splice(
      1,
      0,
      db
        .prepare(
          `DELETE FROM project_collaborators
           WHERE project_id = ? AND user_id = ? AND access_level = 'manager'`,
        )
        .bind(projectId, userId),
    );

  await db.batch(statements);
  if (intent === "verify_next") throw redirect(queueHref("queue"));
  return { saved: true };
}

function queueHref(view: ClaimView, page = 1) {
  const params = new URLSearchParams({ view });
  if (page > 1) params.set("page", String(page));
  return `/admin/project-claims?${params.toString()}`;
}

export default function AdminProjectClaims({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const firstResult =
    loaderData.total === 0
      ? 0
      : (loaderData.page - 1) * loaderData.pageSize + 1;
  const lastResult = Math.min(
    loaderData.total,
    loaderData.page * loaderData.pageSize,
  );

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Founder project trust</span>
            <h1>Project relationship claims</h1>
            <p>
              Review project evidence without changing the canonical owner.
              Verified Founder, Co-Founder and authorized representative claims
              receive project manager access. Revoking one removes that manager
              access again.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin">
            Admin workspace
          </Link>
        </header>

        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success" role="status">
            Project relationship decision saved.
          </p>
        )}

        <div className="admin-queue-toolbar">
          <nav className="admin-filter-tabs" aria-label="Project claim view">
            <Link
              to={queueHref("queue")}
              aria-current={loaderData.view === "queue" ? "page" : undefined}
            >
              Active queue
            </Link>
            <Link
              to={queueHref("history")}
              aria-current={loaderData.view === "history" ? "page" : undefined}
            >
              Reviewed history
            </Link>
          </nav>
          <p className="member-directory-summary" aria-live="polite">
            {loaderData.total === 0 ? (
              "No claims"
            ) : (
              <>
                <strong>{firstResult}</strong> to <strong>{lastResult}</strong>{" "}
                of <strong>{loaderData.total}</strong>
              </>
            )}
          </p>
        </div>

        {loaderData.claims.length === 0 ? (
          <section className="verification-empty-state">
            <span className="chapter">
              {loaderData.view === "queue" ? "Queue clear" : "No history yet"}
            </span>
            <h2>
              {loaderData.view === "queue"
                ? "There are no project relationships waiting for review."
                : "No reviewed project relationships yet."}
            </h2>
          </section>
        ) : (
          <section className="verification-list" aria-label="Project claims">
            <div className="verification-list-head" aria-hidden="true">
              <span>Founder</span>
              <span>Project claim</span>
              <span>Evidence</span>
              <span>{loaderData.view === "queue" ? "Decision" : "Status"}</span>
            </div>
            {loaderData.claims.map((claim) => (
              <article
                className="verification-row"
                key={`${claim.projectId}:${claim.userId}`}
              >
                <div className="verification-person">
                  <strong>
                    <Link to={`/profiles/${claim.username}`}>
                      {claim.displayName}
                    </Link>
                  </strong>
                  <span>@{claim.username}</span>
                </div>
                <div className="verification-claim">
                  <strong>
                    {projectRelationshipLabel(claim.relationshipType)} ·{" "}
                    <Link to={`/projects/${claim.projectSlug}`}>
                      {claim.projectTitle}
                    </Link>
                  </strong>
                  <span>{claim.evidenceNote}</span>
                </div>
                <div className="verification-state">
                  <strong>
                    <a
                      href={claim.evidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open evidence
                    </a>
                  </strong>
                  <span>
                    {projectClaimStatusLabel(claim.claimStatus)} ·{" "}
                    {new Date(claim.claimedAt).toLocaleDateString()}
                  </span>
                </div>

                {loaderData.view === "queue" ? (
                  <Form method="post" className="verification-actions">
                    <input
                      type="hidden"
                      name="projectId"
                      value={claim.projectId}
                    />
                    <input type="hidden" name="userId" value={claim.userId} />
                    <textarea
                      name="decisionNote"
                      rows={2}
                      maxLength={500}
                      placeholder="Decision note. Required for Needs info."
                      aria-label={`Decision note for ${claim.displayName}`}
                    />
                    <button
                      className="button button-primary"
                      name="intent"
                      value="verify_next"
                      disabled={busy}
                    >
                      Approve & next
                    </button>
                    <button
                      className="button button-quiet"
                      name="intent"
                      value="verify"
                      disabled={busy}
                    >
                      Approve
                    </button>
                    <button
                      className="button button-quiet"
                      name="intent"
                      value="hold"
                      disabled={busy}
                    >
                      Needs info
                    </button>
                    <button
                      className="button button-quiet verification-reject"
                      name="intent"
                      value="decline"
                      disabled={busy}
                    >
                      Reject
                    </button>
                  </Form>
                ) : (
                  <div className="verification-reviewed-at">
                    <strong>
                      {projectClaimStatusLabel(claim.claimStatus)}
                    </strong>
                    {claim.decisionNote && <span>{claim.decisionNote}</span>}
                    {claim.reviewedAt && (
                      <span>
                        Reviewed {new Date(claim.reviewedAt).toLocaleDateString()}
                      </span>
                    )}
                    {claim.claimStatus === "verified" && (
                      <Form method="post">
                        <input
                          type="hidden"
                          name="projectId"
                          value={claim.projectId}
                        />
                        <input
                          type="hidden"
                          name="userId"
                          value={claim.userId}
                        />
                        <input
                          type="hidden"
                          name="decisionNote"
                          value="AKARI revoked this previously verified project relationship."
                        />
                        <button
                          className="button button-quiet verification-reject"
                          name="intent"
                          value="revoke"
                          disabled={busy}
                        >
                          Revoke verification
                        </button>
                      </Form>
                    )}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}

        {loaderData.totalPages > 1 && (
          <nav
            className="verification-pagination"
            aria-label="Project claim pages"
          >
            {loaderData.page > 1 && (
              <Link
                className="button button-quiet"
                to={queueHref(loaderData.view, loaderData.page - 1)}
              >
                Previous
              </Link>
            )}
            <span>
              Page {loaderData.page} of {loaderData.totalPages}
            </span>
            {loaderData.page < loaderData.totalPages && (
              <Link
                className="button button-quiet"
                to={queueHref(loaderData.view, loaderData.page + 1)}
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
