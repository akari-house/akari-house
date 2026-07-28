import { Link } from "react-router";
import type { Route } from "./+types/project-manage";
import { ProjectNeedChips } from "~/components/projects/ProjectNeedChips";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });
  const projects = await db
    .prepare(
      `SELECT pr.slug, pr.title, pr.summary, pr.status, pr.stage, pr.seeking,
              pr.updated_at AS updatedAt,
              ol.status AS opportunityStatus
       FROM projects pr
       LEFT JOIN opportunity_listings ol ON ol.project_id = pr.id
       WHERE pr.founder_user_id = ?
       ORDER BY pr.updated_at DESC`,
    )
    .bind(user.id)
    .all<{
      slug: string;
      title: string;
      summary: string;
      status: string;
      stage: string;
      seeking: string;
      updatedAt: string;
      opportunityStatus: string | null;
    }>();
  return { user, projects: projects.results };
}

export default function ProjectManage({ loaderData }: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Founder project desk</span>
            <h1>Manage your project lanterns.</h1>
          </div>
          <Link className="button button-primary" to="/projects/new">
            New project
          </Link>
        </header>
        <div className="project-grid">
          {loaderData.projects.length ? (
            loaderData.projects.map((project) => (
              <article className="project-card" key={project.slug}>
                <span className="chapter">
                  {project.stage.replaceAll("_", " ")} · {project.status}
                </span>
                <h2>{project.title}</h2>
                <p>{project.summary}</p>
                <ProjectNeedChips value={project.seeking} compact />
                {project.opportunityStatus && (
                  <small>
                    Deal Room review:{" "}
                    {project.opportunityStatus.replaceAll("_", " ")}
                  </small>
                )}
                <footer>
                  <Link to={`/projects/${project.slug}`}>View</Link>
                  <Link to={`/projects/${project.slug}/edit`}>
                    Edit project
                  </Link>
                  <Link to={`/projects/${project.slug}/needs`}>Edit needs</Link>
                  <Link to={`/projects/${project.slug}/opportunity`}>
                    Deal preview submission
                  </Link>
                  {project.opportunityStatus && (
                    <Link to={`/projects/${project.slug}/opportunity/manage`}>
                      Deal Room operations
                    </Link>
                  )}
                  <Link to={`/projects/${project.slug}/diligence`}>
                    Private documents and access
                  </Link>
                </footer>
              </article>
            ))
          ) : (
            <div className="status-card">
              <h2>No project lanterns yet.</h2>
              <p>
                Create a project when you are ready to explain what you are
                building, what stage it is in and who you hope to meet.
              </p>
              <Link className="button button-primary" to="/projects/new">
                Create your first project
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
