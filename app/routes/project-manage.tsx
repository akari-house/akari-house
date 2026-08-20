import { Link } from "react-router";
import type { Route } from "./+types/project-manage";
import { ProjectNeedChips } from "~/components/projects/ProjectNeedChips";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  fundraisingStatusLabels,
  type FundraisingStatus,
} from "~/lib/fundraising-readiness";
import { buildProjectReadiness } from "~/lib/project-readiness";
import {
  projectClaimStatusLabel,
  projectRelationshipLabel,
} from "~/lib/project-relationships";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });
  const projects = await db
    .prepare(
      `SELECT pr.slug, pr.title, pr.summary, pr.description, pr.status, pr.stage,
              pr.seeking, pr.logo_key AS logoKey, pr.banner_key AS bannerKey,
              EXISTS(
                SELECT 1 FROM project_social_links psl
                WHERE psl.project_id = pr.id AND psl.platform = 'website'
              ) AS hasWebsite,
              (
                SELECT COUNT(*) FROM project_social_links psl
                WHERE psl.project_id = pr.id
              ) AS socialCount,
              CASE WHEN pr.founder_user_id = ? THEN 'owner'
                   ELSE 'collaborator' END AS accessRole,
              rel.relationship_type AS relationshipType,
              rel.claim_status AS claimStatus,
              pr.updated_at AS updatedAt,
              ol.status AS opportunityStatus,
              fp.readiness_status AS fundraisingStatus,
              COALESCE(pr.data_room_url, '') AS dataRoomUrl
       FROM projects pr
       LEFT JOIN opportunity_listings ol ON ol.project_id = pr.id
       LEFT JOIN project_fundraising_profiles fp ON fp.project_id = pr.id
       LEFT JOIN project_collaborators pc
         ON pc.project_id = pr.id AND pc.user_id = ?
       LEFT JOIN project_relationships rel
         ON rel.project_id = pr.id AND rel.user_id = ?
       WHERE pr.founder_user_id = ? OR pc.user_id = ?
       ORDER BY pr.updated_at DESC`,
    )
    .bind(user.id, user.id, user.id, user.id, user.id)
    .all<{
      slug: string;
      title: string;
      summary: string;
      description: string;
      status: string;
      stage: string;
      seeking: string;
      logoKey: string | null;
      bannerKey: string | null;
      hasWebsite: number;
      socialCount: number;
      accessRole: "owner" | "collaborator";
      relationshipType: string | null;
      claimStatus: string | null;
      updatedAt: string;
      opportunityStatus: string | null;
      fundraisingStatus: FundraisingStatus | null;
      dataRoomUrl: string;
    }>();
  return { user, projects: projects.results };
}

export default function ProjectManage({ loaderData }: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main founder-project-desk">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Founder project desk</span>
            <h1>Make every project ready to be discovered.</h1>
            <p>
              Complete the essentials first. AKARI will show the next useful
              step without blocking you from the deeper Founder tools.
            </p>
          </div>
          <div className="button-row">
            <Link className="button button-quiet" to="/projects/claim">
              Claim existing project
            </Link>
            <Link className="button button-primary" to="/projects/new">
              New project
            </Link>
          </div>
        </header>
        <div className="project-grid project-manage-grid">
          {loaderData.projects.length ? (
            loaderData.projects.map((project) => {
              const readiness = buildProjectReadiness({
                slug: project.slug,
                title: project.title,
                summary: project.summary,
                description: project.description,
                seeking: project.seeking,
                logoKey: project.logoKey,
                bannerKey: project.bannerKey,
                hasWebsite: Boolean(project.hasWebsite),
                socialCount: project.socialCount,
              });

              return (
                <article
                  className="project-card project-manage-card"
                  key={project.slug}
                >
                  {project.bannerKey && (
                    <img
                      className="project-manage-banner"
                      src={`/media/projects/${project.slug}/banner`}
                      alt=""
                    />
                  )}
                  <div className="project-manage-card-body">
                    <span className="chapter">
                      {project.stage.replaceAll("_", " ")} · {project.status}
                    </span>
                    <div className="project-manage-title-row">
                      {project.logoKey && (
                        <img
                          className="project-manage-logo"
                          src={`/media/projects/${project.slug}/logo`}
                          alt=""
                        />
                      )}
                      <div>
                        <h2>{project.title}</h2>
                        <small>Access: {project.accessRole}</small>
                      </div>
                    </div>
                    {project.relationshipType && project.claimStatus ? (
                      <small>
                        Relationship:{" "}
                        {projectRelationshipLabel(project.relationshipType)} ·{" "}
                        {projectClaimStatusLabel(project.claimStatus)}
                      </small>
                    ) : (
                      <small>Relationship: Manager access only</small>
                    )}
                    <p>{project.summary}</p>
                    <ProjectNeedChips value={project.seeking} compact />

                    <section
                      className={`project-readiness-card is-${readiness.status}`}
                      aria-label={`${project.title} project readiness`}
                    >
                      <div className="project-readiness-heading">
                        <span>Project readiness</span>
                        <strong>{readiness.score}%</strong>
                      </div>
                      <div
                        className="project-readiness-track"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={readiness.score}
                        aria-label="Project readiness"
                      >
                        <span style={{ width: `${readiness.score}%` }} />
                      </div>
                      <small>
                        {readiness.completed}/{readiness.total} discovery
                        essentials complete
                      </small>
                      {readiness.nextAction ? (
                        <Link
                          className="project-readiness-next"
                          to={readiness.nextAction.href}
                        >
                          Next: {readiness.nextAction.label}
                        </Link>
                      ) : (
                        <strong className="project-readiness-complete">
                          Discovery profile complete
                        </strong>
                      )}
                      <details className="project-readiness-checklist">
                        <summary>See readiness checklist</summary>
                        <ul>
                          {readiness.items.map((item) => (
                            <li key={item.key}>
                              <span aria-hidden="true">
                                {item.complete ? "✓" : "○"}
                              </span>{" "}
                              {item.complete ? (
                                item.label
                              ) : (
                                <Link to={item.href}>{item.label}</Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </section>

                    <div className="project-manage-signals">
                      <small>
                        Fundraising readiness:{" "}
                        {project.fundraisingStatus
                          ? fundraisingStatusLabels[project.fundraisingStatus]
                          : "Not started"}
                      </small>
                      {project.opportunityStatus && (
                        <small>
                          Deal Room review:{" "}
                          {project.opportunityStatus.replaceAll("_", " ")}
                        </small>
                      )}
                      <small>
                        VantageKit data room:{" "}
                        {project.dataRoomUrl ? "Connected" : "Not connected"}
                      </small>
                    </div>

                    <footer className="project-manage-actions">
                      <Link to={`/projects/${project.slug}`}>View</Link>
                      <Link to={`/projects/${project.slug}/edit`}>
                        Edit project
                      </Link>
                      <Link to={`/projects/${project.slug}/edit/brand`}>
                        Logo & banner
                      </Link>
                      <Link to={`/projects/${project.slug}/needs`}>Needs</Link>
                    </footer>
                    <details className="project-founder-tools">
                      <summary>Founder growth & diligence tools</summary>
                      <div className="project-founder-tools-links">
                        <Link to={`/projects/${project.slug}/fundraising`}>
                          Fundraising readiness
                        </Link>
                        <Link to={`/projects/${project.slug}/opportunity`}>
                          Deal preview submission
                        </Link>
                        {project.opportunityStatus && (
                          <Link
                            to={`/projects/${project.slug}/opportunity/manage`}
                          >
                            Deal Room operations
                          </Link>
                        )}
                        <Link to={`/projects/${project.slug}/diligence`}>
                          Private documents and access
                        </Link>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="status-card">
              <h2>No project lanterns yet.</h2>
              <p>
                Create a project when you are ready to explain what you are
                building, or claim an existing AKARI project if you already
                represent one.
              </p>
              <div className="button-row">
                <Link className="button button-primary" to="/projects/new">
                  Create your first project
                </Link>
                <Link className="button button-quiet" to="/projects/claim">
                  Claim existing project
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
