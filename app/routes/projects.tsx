import { Form, Link } from "react-router";
import type { Route } from "./+types/projects";
import { SiteHeader } from "~/components/SiteHeader";
import { PublicFooter } from "~/components/PublicFooter";
import { ProjectLanternCard } from "~/components/discovery/ProjectLanternCard";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { projectHasOpenNeed } from "~/lib/project-need-status";
import { projectNeedOptions, type ProjectNeed } from "~/lib/project-needs";

type PublicProjectRow = {
  slug: string;
  title: string;
  summary: string;
  stage: string;
  seeking: string;
  supportStatus: string;
  founderName: string;
  founderUsername: string;
  followerCount: number;
  logoKey: string | null;
};

export const meta: Route.MetaFunction = () => [
  { title: "Project Lanterns | AKARI House" },
  {
    name: "description",
    content:
      "Explore approved Founder projects seeking thoughtful collaborators and considered investment inside AKARI House.",
  },
];

async function readPublishedProjects(db: D1Database) {
  try {
    const projects = await db
      .prepare(
        `SELECT pr.slug, pr.title, pr.summary, pr.stage, pr.seeking,
                pr.support_status_json AS supportStatus,
                pr.logo_key AS logoKey,
                p.display_name AS founderName, u.username AS founderUsername,
                COUNT(DISTINCT pf.user_id) AS followerCount
         FROM projects pr
         JOIN users u ON u.id = pr.founder_user_id
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN project_follows pf ON pf.project_id = pr.id
         WHERE pr.status = 'published'
         GROUP BY pr.id
         ORDER BY pr.updated_at DESC`,
      )
      .all<PublicProjectRow>();
    return { items: projects.results, degraded: false };
  } catch (error) {
    console.error("Project directory enhanced query failed.", error);
  }

  try {
    const projects = await db
      .prepare(
        `SELECT pr.slug, pr.title, pr.summary, pr.stage, pr.seeking,
                COALESCE(pr.support_status_json, '{}') AS supportStatus,
                pr.logo_key AS logoKey,
                COALESCE(p.display_name, u.username, 'AKARI Founder') AS founderName,
                u.username AS founderUsername,
                0 AS followerCount
         FROM projects pr
         JOIN users u ON u.id = pr.founder_user_id
         LEFT JOIN profiles p ON p.user_id = u.id
         WHERE pr.status = 'published'
         ORDER BY pr.updated_at DESC`,
      )
      .all<PublicProjectRow>();
    return { items: projects.results, degraded: false };
  } catch (error) {
    console.error("Project directory fallback query failed.", error);
    return { items: [] as PublicProjectRow[], degraded: true };
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const requestedNeed = new URL(request.url).searchParams.get("need") ?? "";
  const selectedNeed = projectNeedOptions.some(
    (option) => option.value === requestedNeed,
  )
    ? (requestedNeed as ProjectNeed)
    : "";
  const projects = await readPublishedProjects(db);
  return {
    user,
    selectedNeed,
    degraded: projects.degraded,
    projects: selectedNeed
      ? projects.items.filter((project) =>
          projectHasOpenNeed(
            project.seeking,
            project.supportStatus,
            selectedNeed,
          ),
        )
      : projects.items,
  };
}

export default function Projects({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell inner-page project-directory-page">
      <SiteHeader user={loaderData.user} />
      <main
        id="main-content"
        className="directory-main directory-room directory-room--projects"
      >
        <header className="directory-heading directory-hero">
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
        <Form method="get" className="project-directory-filter">
          <label>
            Filter by open support need
            <select name="need" defaultValue={loaderData.selectedNeed}>
              <option value="">All projects</option>
              {projectNeedOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-primary">Filter projects</button>
          {loaderData.selectedNeed && (
            <Link className="quiet-link" to="/projects">
              Clear filter
            </Link>
          )}
        </Form>
        <section className="project-lantern-gallery" aria-label="Projects">
          {loaderData.projects.length ? (
            loaderData.projects.map((project) => (
              <ProjectLanternCard project={project} key={project.slug} />
            ))
          ) : (
            <div className="directory-empty is-project">
              <div className="empty-lantern" aria-hidden="true">
                <span />
              </div>
              <div>
                <span className="eyebrow">
                  {loaderData.degraded
                    ? "The gallery is temporarily quiet"
                    : "The gallery before first light"}
                </span>
                <h2>
                  {loaderData.degraded
                    ? "Project lanterns could not be loaded."
                    : loaderData.selectedNeed
                      ? "No published projects currently have this support need open."
                      : "The first project lanterns are being prepared."}
                </h2>
                <p>
                  {loaderData.degraded
                    ? "Please refresh the page in a moment. AKARI will not present an outage as an empty directory."
                    : "Approved Founder projects will gather here with their story, stage and the support they are seeking."}
                </p>
                {loaderData.degraded ? (
                  <Link className="button button-quiet" to="/projects">
                    Retry projects
                  </Link>
                ) : loaderData.selectedNeed ? (
                  <Link className="button button-quiet" to="/projects">
                    View every project
                  </Link>
                ) : loaderData.user?.roles.includes("founder") &&
                  loaderData.user.accessTier === "member" ? (
                  <Link className="button button-primary" to="/projects/new">
                    Light a project lantern
                  </Link>
                ) : (
                  <Link className="button button-quiet" to="/membership">
                    Understand membership
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
