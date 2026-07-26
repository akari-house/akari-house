import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/deals";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser, requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  isVerifiedInvestor,
  recordOpportunityAudit,
} from "~/lib/opportunity-access.server";
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type OpportunityRow = {
  projectId: string;
  slug: string;
  title: string;
  summary: string;
  publicSummary: string;
  stage: string;
  sector: string;
  geography: string;
  fundingInstrument: string;
  raiseMinimum: number | null;
  raiseMaximum: number | null;
  raiseCurrency: string;
  minimumParticipation: number | null;
  closingAt: string | null;
  founderName: string;
  updatedAt: string;
  savedAt: string | null;
  passedAt: string | null;
  requestStatus: string | null;
};

const views = [
  "available",
  "recent",
  "closing",
  "saved",
  "requested",
  "approved",
  "passed",
] as const;

type CatalogueView = (typeof views)[number];

export const meta: Route.MetaFunction = () => [
  { title: "Selected opportunities | AKARI House" },
  {
    name: "description",
    content:
      "Review approved opportunity previews and request controlled access through AKARI House.",
  },
];

function safeView(value: string | null): CatalogueView {
  return views.includes(value as CatalogueView)
    ? (value as CatalogueView)
    : "available";
}

function money(value: number | null, currency: string) {
  if (value === null) return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-GB")}`;
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const url = new URL(request.url);
  const view = safeView(url.searchParams.get("view"));
  const sector = (url.searchParams.get("sector") ?? "").trim().slice(0, 80);
  const stage = (url.searchParams.get("stage") ?? "").trim().slice(0, 80);
  const geography = (url.searchParams.get("geography") ?? "")
    .trim()
    .slice(0, 80);
  const instrument = (url.searchParams.get("instrument") ?? "")
    .trim()
    .slice(0, 40);
  const userId = user?.id ?? "";

  const conditions = ["ol.status = 'published'", "pr.status = 'published'"];
  const values: Array<string> = [userId, userId];
  if (sector) {
    conditions.push("ol.sector = ?");
    values.push(sector);
  }
  if (stage) {
    conditions.push("pr.stage = ?");
    values.push(stage);
  }
  if (geography) {
    conditions.push("ol.geography = ?");
    values.push(geography);
  }
  if (instrument) {
    conditions.push("ol.funding_instrument = ?");
    values.push(instrument);
  }
  if (view === "recent")
    conditions.push("ol.reviewed_at >= datetime('now', '-30 days')");
  if (view === "closing")
    conditions.push(
      "ol.closing_at IS NOT NULL AND ol.closing_at > datetime('now') AND ol.closing_at <= datetime('now', '+30 days')",
    );
  if (view === "saved") conditions.push("ous.saved_at IS NOT NULL");
  if (view === "passed") conditions.push("ous.passed_at IS NOT NULL");
  if (view === "requested") conditions.push("drr.status = 'pending'");
  if (view === "approved")
    conditions.push(
      "drr.status = 'approved' AND (drr.expires_at IS NULL OR drr.expires_at > datetime('now'))",
    );
  if (["saved", "passed", "requested", "approved"].includes(view) && !user)
    conditions.push("1 = 0");

  const result = await db
    .prepare(
      `SELECT pr.id AS projectId, pr.slug, pr.title, pr.summary,
              ol.public_summary AS publicSummary, pr.stage, ol.sector,
              ol.geography, ol.funding_instrument AS fundingInstrument,
              ol.raise_minimum AS raiseMinimum,
              ol.raise_maximum AS raiseMaximum,
              ol.raise_currency AS raiseCurrency,
              ol.minimum_participation AS minimumParticipation,
              ol.closing_at AS closingAt,
              p.display_name AS founderName,
              ol.updated_at AS updatedAt,
              ous.saved_at AS savedAt, ous.passed_at AS passedAt,
              drr.status AS requestStatus
       FROM opportunity_listings ol
       JOIN projects pr ON pr.id = ol.project_id
       JOIN profiles p ON p.user_id = pr.founder_user_id
       LEFT JOIN opportunity_user_states ous
         ON ous.project_id = pr.id AND ous.user_id = ?
       LEFT JOIN data_room_requests drr
         ON drr.project_id = pr.id AND drr.investor_user_id = ?
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         CASE WHEN ol.closing_at IS NULL THEN 1 ELSE 0 END,
         ol.closing_at,
         ol.updated_at DESC
       LIMIT 100`,
    )
    .bind(...values)
    .all<OpportunityRow>();

  const filterRows = await db
    .prepare(
      `SELECT DISTINCT ol.sector, ol.geography,
              ol.funding_instrument AS fundingInstrument
       FROM opportunity_listings ol
       JOIN projects pr ON pr.id = ol.project_id
       WHERE ol.status = 'published' AND pr.status = 'published'
       ORDER BY ol.sector, ol.geography`,
    )
    .all<{
      sector: string;
      geography: string;
      fundingInstrument: string;
    }>();

  return {
    user,
    verifiedInvestor: await isVerifiedInvestor(db, user),
    opportunities: result.results,
    view,
    filters: { sector, stage, geography, instrument },
    options: {
      sectors: [
        ...new Set(filterRows.results.map((row) => row.sector).filter(Boolean)),
      ],
      geographies: [
        ...new Set(
          filterRows.results.map((row) => row.geography).filter(Boolean),
        ),
      ],
      instruments: [
        ...new Set(
          filterRows.results
            .map((row) => row.fundingInstrument)
            .filter(Boolean),
        ),
      ],
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!(await isVerifiedInvestor(db, user)))
    throw new Response("Verified Investor access required.", { status: 403 });
  await requireActionRateLimit(
    db,
    request,
    "opportunity-catalogue",
    user.id,
    40,
    60,
  );
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const projectId = formText(form.get("projectId"));
  const returnTo = formText(form.get("returnTo")) || "/deals";
  const listing = await db
    .prepare(
      `SELECT ol.project_id AS projectId
       FROM opportunity_listings ol
       JOIN projects pr ON pr.id = ol.project_id
       WHERE ol.project_id = ?
         AND ol.status = 'published' AND pr.status = 'published'`,
    )
    .bind(projectId)
    .first<{ projectId: string }>();
  if (!listing) throw new Response("Opportunity not found.", { status: 404 });

  if (intent === "save" || intent === "pass") {
    const savedAt = intent === "save" ? new Date().toISOString() : null;
    const passedAt = intent === "pass" ? new Date().toISOString() : null;
    await db
      .prepare(
        `INSERT INTO opportunity_user_states
           (project_id, user_id, saved_at, passed_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(project_id, user_id) DO UPDATE SET
           saved_at = excluded.saved_at,
           passed_at = excluded.passed_at,
           updated_at = datetime('now')`,
      )
      .bind(projectId, user.id, savedAt, passedAt)
      .run();
    await recordOpportunityAudit(
      db,
      user.id,
      intent === "save" ? "opportunity.saved" : "opportunity.passed",
      projectId,
    );
    throw redirect(returnTo.startsWith("/deals") ? returnTo : "/deals");
  }

  if (intent === "clear-state") {
    await db
      .prepare(
        `DELETE FROM opportunity_user_states
         WHERE project_id = ? AND user_id = ?`,
      )
      .bind(projectId, user.id)
      .run();
    await recordOpportunityAudit(
      db,
      user.id,
      "opportunity.preference_cleared",
      projectId,
    );
    throw redirect(returnTo.startsWith("/deals") ? returnTo : "/deals");
  }

  throw new Response("Unsupported action.", { status: 400 });
}

export default function Deals({ loaderData }: Route.ComponentProps) {
  const currentQuery = new URLSearchParams();
  currentQuery.set("view", loaderData.view);
  for (const [key, value] of Object.entries(loaderData.filters))
    if (value) currentQuery.set(key, value);
  const returnTo = `/deals?${currentQuery.toString()}`;

  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="deals-main">
        <header className="deals-hero">
          <div>
            <span className="chapter">Selected opportunities</span>
            <h1>Considered opportunities, opened with context.</h1>
            <p>
              Explore approved previews. Confidential information remains closed
              until eligibility and access are confirmed.
            </p>
          </div>
          <aside>
            <strong>Discovery is not endorsement.</strong>
            <p>
              AKARI supports professional discovery and introductions. Members
              remain responsible for independent due diligence.
            </p>
          </aside>
        </header>

        {!loaderData.verifiedInvestor &&
          loaderData.user?.roles.includes("investor") && (
            <p className="notice applicant-notice">
              Your Investor role is not yet verified. You can review approved
              public previews, while saved lists and private rooms remain
              unavailable.
            </p>
          )}

        <section className="deals-controls" aria-labelledby="deal-filter-title">
          <div>
            <span className="eyebrow">Catalogue</span>
            <h2 id="deal-filter-title">Find relevant context</h2>
          </div>
          <Form method="get" className="deal-filter-form">
            <label>
              View
              <select name="view" defaultValue={loaderData.view}>
                {views.map((view) => (
                  <option key={view} value={view}>
                    {view.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sector
              <select name="sector" defaultValue={loaderData.filters.sector}>
                <option value="">All sectors</option>
                {loaderData.options.sectors.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Stage
              <select name="stage" defaultValue={loaderData.filters.stage}>
                <option value="">All stages</option>
                <option value="idea">Idea</option>
                <option value="prototype">Prototype</option>
                <option value="early_revenue">Early revenue</option>
                <option value="growth">Growth</option>
              </select>
            </label>
            <label>
              Geography
              <select
                name="geography"
                defaultValue={loaderData.filters.geography}
              >
                <option value="">All geographies</option>
                {loaderData.options.geographies.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Instrument
              <select
                name="instrument"
                defaultValue={loaderData.filters.instrument}
              >
                <option value="">All instruments</option>
                {loaderData.options.instruments.map((value) => (
                  <option key={value} value={value}>
                    {value.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-primary" type="submit">
              Apply filters
            </button>
          </Form>
        </section>

        <section className="deal-card-grid" aria-label="Opportunity catalogue">
          {loaderData.opportunities.length === 0 ? (
            <article className="empty-state">
              <h2>No opportunities match this view.</h2>
              <p>Adjust the filters or return to the available catalogue.</p>
              <Link className="button button-quiet" to="/deals">
                Clear filters
              </Link>
            </article>
          ) : (
            loaderData.opportunities.map((opportunity) => {
              const range = [
                money(opportunity.raiseMinimum, opportunity.raiseCurrency),
                money(opportunity.raiseMaximum, opportunity.raiseCurrency),
              ].filter(Boolean);
              return (
                <article className="deal-card" key={opportunity.projectId}>
                  <div className="deal-card-topline">
                    <span>{opportunity.sector || "Selected opportunity"}</span>
                    <span>{opportunity.stage.replace("_", " ")}</span>
                  </div>
                  <h2>
                    <Link to={`/deals/${opportunity.slug}`}>
                      {opportunity.title}
                    </Link>
                  </h2>
                  <p>{opportunity.publicSummary || opportunity.summary}</p>
                  <dl>
                    {opportunity.geography && (
                      <div>
                        <dt>Geography</dt>
                        <dd>{opportunity.geography}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Instrument</dt>
                      <dd>{opportunity.fundingInstrument.replace("_", " ")}</dd>
                    </div>
                    {range.length > 0 && (
                      <div>
                        <dt>Raise</dt>
                        <dd>{range.join(" – ")}</dd>
                      </div>
                    )}
                    {opportunity.closingAt && (
                      <div>
                        <dt>Timeline</dt>
                        <dd>
                          {new Date(opportunity.closingAt).toLocaleDateString(
                            "en-GB",
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <p className="deal-founder">
                    Shared by {opportunity.founderName}
                  </p>
                  <div className="deal-card-actions">
                    <Link
                      className="button button-primary"
                      to={`/deals/${opportunity.slug}`}
                    >
                      Review preview
                    </Link>
                    {loaderData.verifiedInvestor && (
                      <Form method="post">
                        <input
                          type="hidden"
                          name="projectId"
                          value={opportunity.projectId}
                        />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button
                          className="button button-quiet"
                          name="intent"
                          value={opportunity.savedAt ? "clear-state" : "save"}
                        >
                          {opportunity.savedAt ? "Saved" : "Save"}
                        </button>
                      </Form>
                    )}
                  </div>
                  {opportunity.requestStatus && (
                    <small>Room access: {opportunity.requestStatus}</small>
                  )}
                </article>
              );
            })
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
