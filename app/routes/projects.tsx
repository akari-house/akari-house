import { Link } from "react-router";
import type { Route } from "./+types/projects";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const projects = await db
    .prepare(
      `SELECT pr.slug, pr.title, pr.summary, pr.stage, pr.seeking,
              p.display_name AS founderName, u.username AS founderUsername,
              COUNT(DISTINCT pf.user_id) AS followerCount
       FROM projects pr
       JOIN users u ON u.id = pr.founder_user_id
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN project_follows pf ON pf.project_id = pr.id
       WHERE pr.status = 'published'
       GROUP BY pr.id
       ORDER BY pr.updated_at DESC`,
    )
    .all<{
      slug: string;
      title: string;
      summary: string;
      stage: string;
      seeking: string;
      founderName: string;
      founderUsername: string;
      followerCount: number;
    }>();
  return { user, projects: projects.results };
}

export default function Projects({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">AKARI project lanterns</span>
            <h1>Ideas looking for the right people.</h1>
            <p>
              Follow work that matters or express considered investment
              interest. Private contact details remain permission-controlled.
            </p>
          </div>
          {loaderData.user?.accessTier === "member" &&
            loaderData.user.roles.includes("founder") && (
              <Link className="button button-primary" to="/projects/new">
                Create a project
              </Link>
            )}
        </header>
        <div className="project-grid">
          {loaderData.projects.length ? (
            loaderData.projects.map((project) => (
              <article className="project-card" key={project.slug}>
                <span className="chapter">{project.stage.replace("_", " ")}</span>
                <h2>
                  <Link to={`/projects/${project.slug}`}>{project.title}</Link>
                </h2>
                <p>{project.summary}</p>
                {project.seeking && (
                  <p className="project-seeking">
                    <strong>Seeking:</strong> {project.seeking}
                  </p>
                )}
                <footer>
                  <Link to={`/profiles/${project.founderUsername}`}>
                    {project.founderName}
                  </Link>
                  <span>{project.followerCount} following</span>
                </footer>
              </article>
            ))
          ) : (
            <div className="status-card">
              <h2>The first lanterns are being prepared.</h2>
              <p>Approved projects will appear here after review.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
