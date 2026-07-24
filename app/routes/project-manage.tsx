import { Link } from "react-router";
import type { Route } from "./+types/project-manage";
import { ProjectNeedChips } from "~/components/projects/ProjectNeedChips";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const projects = await db
    .prepare(
      `SELECT slug, title, summary, status, stage, seeking,
              updated_at AS updatedAt
       FROM projects WHERE founder_user_id = ?
       ORDER BY updated_at DESC`,
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
                <footer>
                  <Link to={`/projects/${project.slug}`}>View</Link>
                  <Link to={`/projects/${project.slug}/edit`}>Edit</Link>
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
