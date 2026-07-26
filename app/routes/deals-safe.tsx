import type { ComponentType } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/deals-safe";
import ExistingDeals, {
  action as existingDealsAction,
  loader as existingDealsLoader,
} from "./deals";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { isOpportunitySchemaUnavailable } from "~/lib/opportunity-schema.server";

type ExistingLoaderData = Awaited<ReturnType<typeof existingDealsLoader>>;
type ExistingDealsProps = { loaderData: ExistingLoaderData };

type FallbackProject = {
  slug: string;
  title: string;
  summary: string;
  stage: string;
  seeking: string;
  founderName: string;
};

const ExistingDealsView = ExistingDeals as unknown as ComponentType<ExistingDealsProps>;

export const meta: Route.MetaFunction = () => [
  { title: "Selected opportunities | AKARI House" },
  {
    name: "description",
    content:
      "Review approved opportunity previews and request controlled access through AKARI House.",
  },
];

export async function loader(args: Route.LoaderArgs) {
  try {
    return {
      mode: "ready" as const,
      data: await existingDealsLoader(args as never),
    };
  } catch (error) {
    if (!isOpportunitySchemaUnavailable(error)) throw error;

    const db = args.context.get(cloudflareContext).env.DB;
    const [user, projects] = await Promise.all([
      getOptionalUser(args.request, db),
      db
        .prepare(
          `SELECT pr.slug, pr.title, pr.summary, pr.stage, pr.seeking,
                  p.display_name AS founderName
           FROM projects pr
           JOIN profiles p ON p.user_id = pr.founder_user_id
           WHERE pr.status = 'published'
           ORDER BY pr.updated_at DESC
           LIMIT 24`,
        )
        .all<FallbackProject>(),
    ]);

    console.error("Opportunity catalogue schema is not ready in this environment.");
    return {
      mode: "fallback" as const,
      user,
      projects: projects.results,
    };
  }
}

export async function action(args: Route.ActionArgs) {
  try {
    return await existingDealsAction(args as never);
  } catch (error) {
    if (isOpportunitySchemaUnavailable(error))
      throw new Response("Deal actions are temporarily unavailable.", {
        status: 503,
      });
    throw error;
  }
}

export default function DealsSafe({ loaderData }: Route.ComponentProps) {
  if (loaderData.mode === "ready")
    return <ExistingDealsView loaderData={loaderData.data} />;

  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="deals-main">
        <header className="deals-hero">
          <div>
            <span className="chapter">Selected opportunities</span>
            <h1>Considered opportunities, opened with context.</h1>
            <p>
              The public catalogue remains available while the permissioned deal
              room is activated for this production environment.
            </p>
          </div>
          <aside>
            <strong>No confidential information is exposed.</strong>
            <p>
              Public project profiles remain available. Private Investor access,
              documents and actions stay closed until the production schema is
              ready.
            </p>
          </aside>
        </header>

        <p className="notice applicant-notice" role="status">
          The Deals Room is being prepared. You can still review the approved
          public project profiles below without encountering an error page.
        </p>

        <section className="deal-card-grid" aria-label="Available public projects">
          {loaderData.projects.length === 0 ? (
            <article className="empty-state">
              <h2>No approved opportunities are published yet.</h2>
              <p>New opportunities will appear here after AKARI review.</p>
              <Link className="button button-quiet" to="/projects">
                Explore projects
              </Link>
            </article>
          ) : (
            loaderData.projects.map((project) => (
              <article className="deal-card" key={project.slug}>
                <div className="deal-card-topline">
                  <span>Public project profile</span>
                  <span>{project.stage.replace("_", " ")}</span>
                </div>
                <h2>
                  <Link to={`/projects/${project.slug}`}>{project.title}</Link>
                </h2>
                <p>{project.summary}</p>
                {project.seeking && (
                  <dl>
                    <div>
                      <dt>Seeking</dt>
                      <dd>{project.seeking}</dd>
                    </div>
                  </dl>
                )}
                <p className="deal-founder">Shared by {project.founderName}</p>
                <div className="deal-card-actions">
                  <Link
                    className="button button-primary"
                    to={`/projects/${project.slug}`}
                  >
                    Review public profile
                  </Link>
                </div>
              </article>
            ))
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
