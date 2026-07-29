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

export const meta: Route.MetaFunction = () => [
  { title: "Creator Campaigns | AKARI House" },
  {
    name: "description",
    content:
      "Find reviewed AKARI Creator campaigns, understand eligibility and deadlines, and apply to work with published Founder projects.",
  },
];

function formatDeadline(value: string | null) {
  if (!value) return "No deadline published";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "Check campaign details";
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

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
  const isCreator =
    loaderData.user?.accessTier === "member" &&
    loaderData.user.roles.includes("creator");

  return (
    <div className="site-shell inner-page campaign-directory-page">
      <SiteHeader user={loaderData.user} />
      <main
        id="main-content"
        className="directory-main directory-room directory-room--campaigns"
      >
        <header className="directory-heading directory-hero">
          <div>
            <span className="eyebrow">Creator Campaigns</span>
            <h1>Find campaigns that fit your voice and audience.</h1>
            <p>
              Review the project, eligibility, deadline and expected work before
              deciding whether to apply.
            </p>
            {isCreator && (
              <p className="directory-role-note">
                Your Creator profile is active. Open a campaign to check your fit
                and application status.
              </p>
            )}
          </div>
        </header>

        <section
          className="campaign-directory-guide"
          aria-labelledby="campaign-guide-title"
        >
          <div>
            <span className="chapter">A clear path</span>
            <h2 id="campaign-guide-title">From discovery to delivery</h2>
          </div>
          <ol>
            <li>
              <strong>1</strong>
              <span>Check fit, compensation and deadline.</span>
            </li>
            <li>
              <strong>2</strong>
              <span>Read the complete brief and eligibility.</span>
            </li>
            <li>
              <strong>3</strong>
              <span>Apply, then follow work and settlement in one place.</span>
            </li>
          </ol>
        </section>

        <section aria-labelledby="open-campaigns-title">
          <div className="campaign-directory-section-heading">
            <span className="chapter">Available now</span>
            <h2 id="open-campaigns-title">Open Creator campaigns</h2>
            <p>
              Only reviewed campaigns from published Founder projects appear
              here.
            </p>
          </div>
          <div className="project-lantern-gallery">
            {loaderData.campaigns.length ? (
              loaderData.campaigns.map((campaign) => (
                <article
                  className="status-card campaign-directory-card"
                  key={campaign.slug}
                >
                  <span className="chapter">
                    {campaign.campaignKind === "iio"
                      ? "Initial Interest Offering"
                      : "Creator campaign"}
                  </span>
                  <h3>
                    <Link to={`/campaigns/${campaign.slug}`}>
                      {campaign.title}
                    </Link>
                  </h3>
                  <p>{campaign.summary}</p>
                  <dl className="campaign-directory-facts">
                    <div>
                      <dt>Project</dt>
                      <dd>
                        <Link to={`/projects/${campaign.projectSlug}`}>
                          {campaign.projectTitle}
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt>Apply by</dt>
                      <dd>{formatDeadline(campaign.applicationDeadline)}</dd>
                    </div>
                    {campaign.compensation && (
                      <div>
                        <dt>Compensation</dt>
                        <dd>{campaign.compensation}</dd>
                      </div>
                    )}
                  </dl>
                  <Link
                    className="button button-quiet campaign-directory-action"
                    to={`/campaigns/${campaign.slug}`}
                  >
                    Review campaign details
                  </Link>
                </article>
              ))
            ) : (
              <div className="status-card campaign-directory-card campaign-directory-empty">
                <h3>No open campaigns right now</h3>
                <p>
                  Reviewed Creator campaigns will appear here as soon as a
                  Founder opens applications.
                </p>
                <Link className="quiet-link" to="/projects">
                  Explore Founder projects
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
