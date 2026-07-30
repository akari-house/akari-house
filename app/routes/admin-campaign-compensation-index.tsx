import { Link } from "react-router";
import type { Route } from "./+types/admin-campaign-compensation-index";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "campaigns");
  const campaigns = await db
    .prepare(
      `SELECT c.slug, c.title, c.status, c.campaign_kind AS campaignKind,
              c.application_deadline AS applicationDeadline,
              c.starts_at AS startsAt, c.ends_at AS endsAt,
              c.budget_cents AS budgetCents, c.currency,
              c.roster_finalized_at AS rosterFinalizedAt,
              p.title AS projectTitle,
              COUNT(ca.id) AS applicationCount,
              SUM(CASE WHEN ca.status = 'accepted' THEN 1 ELSE 0 END) AS acceptedCount
       FROM ambassador_campaigns c
       JOIN projects p ON p.id = c.project_id
       LEFT JOIN campaign_applications ca
         ON ca.campaign_id = c.id AND ca.status <> 'withdrawn'
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
    )
    .all<{
      slug: string;
      title: string;
      status: string;
      campaignKind: string;
      applicationDeadline: string | null;
      startsAt: string | null;
      endsAt: string | null;
      budgetCents: number;
      currency: string;
      rosterFinalizedAt: string | null;
      projectTitle: string;
      applicationCount: number;
      acceptedCount: number;
    }>();
  return { user, campaigns: campaigns.results };
}

export default function AdminCampaignCompensationIndex({
  loaderData,
}: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Creator compensation</span>
            <h1>Verify, select, reward and report.</h1>
            <p>
              Campaign budgets and individual payments remain private to AKARI
              operators and the relevant Creator.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin/campaigns">
            Campaign control room
          </Link>
        </header>
        <section className="application-list">
          {loaderData.campaigns.map((campaign) => (
            <article className="application-card" key={campaign.slug}>
              <div>
                <span className="chapter">
                  {campaign.campaignKind === "iio" ? "IIO" : "Campaign"} ·{" "}
                  {campaign.status}
                </span>
                <h2>{campaign.title}</h2>
                <p>
                  {campaign.projectTitle} · {campaign.applicationCount} applicants ·{" "}
                  {campaign.acceptedCount} accepted
                </p>
                <small>
                  Registration closes {campaign.applicationDeadline ?? "not set"} ·
                  campaign ends {campaign.endsAt ?? "not set"}
                </small>
              </div>
              <Link
                className="button button-primary"
                to={`/admin/campaign-compensation/${campaign.slug}`}
              >
                Open compensation
              </Link>
            </article>
          ))}
          {!loaderData.campaigns.length && (
            <div className="status-card">
              <h2>No campaigns are available.</h2>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
