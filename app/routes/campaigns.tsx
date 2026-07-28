import { Link } from "react-router";
import type { Route } from "./+types/campaigns";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

type PublicCampaignRow = {
  slug: string;
  title: string;
  summary: string;
  compensation: string;
  campaignKind: string;
  applicationDeadline: string | null;
  projectSlug: string;
  projectTitle: string;
};

async function readPublishedCampaigns(db: D1Database) {
  try {
    const campaigns = await db
      .prepare(
        `SELECT c.slug, c.title, c.summary, c.compensation,
                c.campaign_kind AS campaignKind,
                c.application_deadline AS applicationDeadline,
                p.slug AS projectSlug, p.title AS projectTitle
         FROM ambassador_campaigns c
         JOIN projects p ON p.id = c.project_id
         WHERE c.status = 'published' AND p.status = 'published'
         ORDER BY c.updated_at DESC`,
      )
      .all<PublicCampaignRow>();
    return campaigns.results;
  } catch (error) {
    console.error("Campaign directory enhanced query failed.", error);
  }

  try {
    const campaigns = await db
      .prepare(
        `SELECT c.slug, c.title, c.summary, c.compensation,
                'campaign' AS campaignKind,
                c.application_deadline AS applicationDeadline,
                p.slug AS projectSlug, p.title AS projectTitle
         FROM ambassador_campaigns c
         JOIN projects p ON p.id = c.project_id
         WHERE c.status = 'published' AND p.status = 'published'
         ORDER BY c.created_at DESC`,
      )
      .all<PublicCampaignRow>();
    return campaigns.results;
  } catch (error) {
    console.error("Campaign directory fallback query failed.", error);
    return [] as PublicCampaignRow[];
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const [user, campaigns] = await Promise.all([
    getOptionalUser(request, db),
    readPublishedCampaigns(db),
  ]);
  return { user, campaigns };
}

export default function Campaigns({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell inner-page campaign-directory-page">
      <SiteHeader user={loaderData.user} />
      <main
        id="main-content"
        className="directory-main directory-room directory-room--campaigns"
      >
        <header className="directory-heading directory-hero">
          <div>
            <span className="eyebrow">Initial Interest Offerings</span>
            <h1>Where project stories meet Creator influence.</h1>
            <p>
              Follow the project first, understand its story, then apply with
              clear context.
            </p>
          </div>
        </header>
        <section className="project-lantern-gallery">
          {loaderData.campaigns.length ? (
            loaderData.campaigns.map((campaign) => (
              <article
                className="status-card campaign-directory-card"
                key={campaign.slug}
              >
                <span className="chapter">
                  {campaign.campaignKind === "iio" ? "IIO · Live" : "Campaign"}{" "}
                  · {campaign.projectTitle}
                </span>
                <h2>
                  <Link to={`/campaigns/${campaign.slug}`}>
                    {campaign.title}
                  </Link>
                </h2>
                <p>{campaign.summary}</p>
                {campaign.campaignKind !== "iio" && campaign.compensation && (
                  <p>{campaign.compensation}</p>
                )}
                <Link className="quiet-link" to={`/campaigns/${campaign.slug}`}>
                  Enter the offering
                </Link>
              </article>
            ))
          ) : (
            <div className="status-card campaign-directory-card campaign-directory-empty">
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
