import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-claim";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  claimableProjectRelationshipTypes,
  isClaimableProjectRelationshipType,
  projectClaimStatusLabel,
  projectRelationshipLabel,
  projectSlugFromReference,
} from "~/lib/project-relationships";
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

function validEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });

  const [projects, claims] = await Promise.all([
    db
      .prepare(
        `SELECT pr.slug, pr.title
         FROM projects pr
         WHERE pr.status = 'published'
         ORDER BY pr.updated_at DESC
         LIMIT 50`,
      )
      .all<{ slug: string; title: string }>(),
    db
      .prepare(
        `SELECT pr.slug, pr.title,
                rel.relationship_type AS relationshipType,
                rel.claim_status AS claimStatus,
                rel.updated_at AS updatedAt,
                rel.decision_note AS decisionNote
         FROM project_relationships rel
         JOIN projects pr ON pr.id = rel.project_id
         WHERE rel.user_id = ?
         ORDER BY rel.updated_at DESC`,
      )
      .bind(user.id)
      .all<{
        slug: string;
        title: string;
        relationshipType: string;
        claimStatus: string;
        updatedAt: string;
        decisionNote: string;
      }>(),
  ]);

  return {
    user,
    projects: projects.results,
    claims: claims.results,
    submitted: new URL(request.url).searchParams.has("submitted"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });

  await requireActionRateLimit(db, request, "project-claim", user.id, 8, 3600);

  const form = await request.formData();
  const projectReference = formText(form.get("projectReference"));
  const requestedRelationshipType = formText(form.get("relationshipType"));
  const evidenceUrl = formText(form.get("evidenceUrl")).trim();
  const evidenceNote = formText(form.get("evidenceNote")).trim();
  const slug = projectSlugFromReference(projectReference);

  if (
    !slug ||
    !isClaimableProjectRelationshipType(requestedRelationshipType) ||
    !validEvidenceUrl(evidenceUrl) ||
    evidenceUrl.length > 500 ||
    evidenceNote.length < 30 ||
    evidenceNote.length > 1200
  )
    return {
      error:
        "Enter a valid AKARI project, relationship, evidence URL and a 30 to 1,200 character explanation.",
    };

  const project = await db
    .prepare(
      `SELECT id, slug, title, status, founder_user_id AS founderUserId
       FROM projects
       WHERE slug = ?`,
    )
    .bind(slug)
    .first<{
      id: string;
      slug: string;
      title: string;
      status: string;
      founderUserId: string;
    }>();
  if (
    !project ||
    (project.status !== "published" && project.founderUserId !== user.id)
  )
    return { error: "That AKARI project could not be found." };

  const existing = await db
    .prepare(
      `SELECT relationship_type AS relationshipType,
              claim_status AS claimStatus
       FROM project_relationships
       WHERE project_id = ? AND user_id = ?`,
    )
    .bind(project.id, user.id)
    .first<{ relationshipType: string; claimStatus: string }>();

  if (existing?.claimStatus === "verified")
    return {
      error: "Your relationship with this project is already verified.",
    };
  if (existing?.claimStatus === "pending")
    return { error: "This project relationship is already awaiting review." };

  const relationshipType =
    project.founderUserId === user.id ? "founder" : requestedRelationshipType;

  await db.batch([
    db
      .prepare(
        `INSERT INTO project_relationships
         (project_id, user_id, relationship_type, claim_status,
          evidence_url, evidence_note, claimed_at)
         VALUES (?, ?, ?, 'pending', ?, ?, datetime('now'))
         ON CONFLICT(project_id, user_id) DO UPDATE SET
           relationship_type = excluded.relationship_type,
           claim_status = 'pending',
           evidence_url = excluded.evidence_url,
           evidence_note = excluded.evidence_note,
           claimed_at = datetime('now'),
           reviewed_by = NULL,
           reviewed_at = NULL,
           decision_note = '',
           updated_at = datetime('now')`,
      )
      .bind(project.id, user.id, relationshipType, evidenceUrl, evidenceNote),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'project.relationship_claimed', 'project', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        project.id,
        JSON.stringify({
          relationshipType,
          evidenceUrl,
          resubmitted: Boolean(existing),
        }),
      ),
  ]);

  throw redirect("/projects/claim?submitted=1");
}

export default function ProjectClaim({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <span className="eyebrow">Founder project desk</span>
        <h1>Claim your relationship with a project.</h1>
        <p>
          A claim does not change the current project owner. AKARI reviews the
          evidence first, then verified relationships can receive project
          management access.
        </p>

        {loaderData.submitted && (
          <p className="notice success" role="status">
            Project relationship submitted for AKARI review.
          </p>
        )}
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <Form method="post" className="profile-form">
          <label>
            AKARI project URL or slug
            <input
              name="projectReference"
              list="project-claim-options"
              placeholder="https://akarihouse.com/projects/project-name"
              required
            />
          </label>
          <datalist id="project-claim-options">
            {loaderData.projects.map((project) => (
              <option key={project.slug} value={project.slug}>
                {project.title}
              </option>
            ))}
          </datalist>
          <label>
            Your relationship
            <select name="relationshipType" defaultValue="founder">
              {claimableProjectRelationshipTypes.map((relationshipType) => (
                <option key={relationshipType} value={relationshipType}>
                  {projectRelationshipLabel(relationshipType)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Public evidence URL
            <input
              name="evidenceUrl"
              type="url"
              maxLength={500}
              placeholder="Company website, team page, LinkedIn or other evidence"
              required
            />
          </label>
          <label>
            Explain the relationship
            <textarea
              name="evidenceNote"
              rows={5}
              minLength={30}
              maxLength={1200}
              placeholder="Tell AKARI what your role is and how the evidence supports the claim."
              required
            />
          </label>
          <div className="button-row">
            <button
              className="button button-primary"
              disabled={navigation.state !== "idle"}
            >
              {navigation.state === "idle"
                ? "Submit relationship claim"
                : "Submitting claim..."}
            </button>
            <Link className="button button-quiet" to="/projects/manage">
              Back to my projects
            </Link>
          </div>
        </Form>

        {loaderData.claims.length > 0 && (
          <section className="project-action-panel">
            <span className="eyebrow">Your project relationships</span>
            <h2>Claim and verification status</h2>
            <div className="review-table" role="list">
              {loaderData.claims.map((claim) => (
                <article
                  key={claim.slug}
                  className="review-row"
                  role="listitem"
                >
                  <div>
                    <strong>{claim.title}</strong>
                    <span>
                      {projectRelationshipLabel(claim.relationshipType)}
                    </span>
                  </div>
                  <div>
                    <strong>
                      {projectClaimStatusLabel(claim.claimStatus)}
                    </strong>
                    {claim.decisionNote && <span>{claim.decisionNote}</span>}
                  </div>
                  <Link to={`/projects/${claim.slug}`}>View project</Link>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
