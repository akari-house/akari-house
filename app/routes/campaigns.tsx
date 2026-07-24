import { Link } from "react-router";
import type { Route } from "./+types/campaigns";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const [user, campaigns] = await Promise.all([
    getOptionalUser(request, db),
    db
      .prepare(
        `SELECT c.slug, c.title, c.summary, c.compensation,
                c.application_deadline AS applicationDeadline,
                p.slug AS projectSlug, p.title AS projectTitle
         FROM ambassador_campaigns c
         JOIN projects p ON p.id = c.project_id
         WHERE c.status = 'published' AND p.status = 'published'
         ORDER BY c.updated_at DESC`,
      )
      .all<{
        slug: string;
        title: string;
        summary: string;
        compensation: string;
        applicationDeadline: string | null;
        projectSlug: string;
        projectTitle: string;
      }>(),
  ]);
  return { user, campaigns: campaigns.results };
}

export default function Campaigns({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Ambassador campaigns</span>
            <h1>Projects inviting creators in.</h1>
            <p>
              Follow the project first, understand its story, then apply with
              clear context.
            </p>
          </div>
        </header>
        <section className="project-lantern-gallery">
          {loaderData.campaigns.length ? (
            loaderData.campaigns.map((campaign) => (
              <article className="status-card" key={campaign.slug}>
                <span className="chapter">{campaign.projectTitle}</span>
                <h2>
                  <Link to={`/campaigns/${campaign.slug}`}>
                    {campaign.title}
                  </Link>
                </h2>
                <p>{campaign.summary}</p>
                {campaign.compensation && <p>{campaign.compensation}</p>}
                <Link className="quiet-link" to={`/campaigns/${campaign.slug}`}>
                  Read campaign brief
                </Link>
              </article>
            ))
          ) : (
            <div className="status-card">
              <h2>No open campaigns yet</h2>
              <p>Approved Founder campaigns will appear here after review.</p>
            </div>
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
