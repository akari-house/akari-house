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
import { isOpportunitySchemaUnavailable } from "~/lib/opportunity-schema.server";
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
  tractionStage: string;
  closingAt: string | null;
  founderName: string;
  updatedAt: string;
  savedAt: string | null;
  passedAt: string | null;
  requestStatus: string | null;
  listingStatus: string;
};

const views = [
  "available",
  "recent",
  "closing",
  "saved",
  "requested",
  "approved",
  "passed",
  "archived",
] as const;

type CatalogueView = (typeof views)[number];

type CatalogueFilters = {
  sector: string;
  stage: string;
  geography: string;
  instrument: string;
  raise: string;
  minimum: string;
  traction: string;
  timeline: string;
};

export const meta: Route.MetaFunction = () => [
  { title: "Selected Deal Rooms | AKARI House" },
  {
    name: "description",
    content:
      "Review approved opportunity previews and request controlled Deal Room access through AKARI House.",
  },
];

function safeView(value: string | null): CatalogueView {
  return views.includes(value as CatalogueView)
    ? (value as CatalogueView)
    : "available";
}

function safeFilter(value: string | null, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength);
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
  const filters: CatalogueFilters = {
    sector: safeFilter(url.searchParams.get("sector"), 80),
    stage: safeFilter(url.searchParams.get("stage"), 80),
    geography: safeFilter(url.searchParams.get("geography"), 80),
    instrument: safeFilter(url.searchParams.get("instrument"), 40),
    raise: safeFilter(url.searchParams.get("raise"), 30),
    minimum: safeFilter(url.searchParams.get("minimum"), 30),
    traction: safeFilter(url.searchParams.get("traction"), 120),
    timeline: safeFilter(url.searchParams.get("timeline"), 10),
  };
  const userId = user?.id ?? "";

  try {
    await db
      .prepare(
        `SELECT ol.project_id, ol.status, ol.reviewed_at, ol.closing_at,
                ol.sector, ol.geography, ol.funding_instrument,
                ol.raise_minimum, ol.raise_maximum, ol.raise_currency,
                ol.minimum_participation, ol.traction_stage,
                ol.public_summary, ol.updated_at,
                ous.saved_at, ous.passed_at,
                drr.status AS requestStatus, drr.expires_at
         FROM opportunity_listings ol
         LEFT JOIN opportunity_user_states ous
           ON ous.project_id = ol.project_id
         LEFT JOIN data_room_requests drr
           ON drr.project_id = ol.project_id
         LIMIT 1`,
      )
      .first();
  } catch (error) {
    if (!isOpportunitySchemaUnavailable(error)) throw error;
    return {
      user,
      verifiedInvestor: false,
      schemaReady: false,
      opportunities: [] as OpportunityRow[],
      view,
      filters,
      options: {
        sectors: [] as string[],
        geographies: [] as string[],
        instruments: [] as string[],
        tractionStages: [] as string[],
      },
    };
  }

  const verifiedInvestor = await isVerifiedInvestor(db, user);
  const archived = view === "archived";
  const conditions = [archived ? "ol.status = 'archived'" : "ol.status = 'published'"];
  if (!archived) conditions.push("pr.status = 'published'");
  const values: Array<string | number> = [userId, userId];

  if (filters.sector) {
    conditions.push("ol.sector = ?");
    values.push(filters.sector);
  }
  if (filters.stage) {
    conditions.push("pr.stage = ?");
    values.push(filters.stage);
  }
  if (filters.geography) {
    conditions.push("ol.geography = ?");
    values.push(filters.geography);
  }
  if (filters.instrument) {
    conditions.push("ol.funding_instrument = ?");
    values.push(filters.instrument);
  }
  if (filters.traction) {
    conditions.push("ol.traction_stage = ?");
    values.push(filters.traction);
  }
  if (filters.raise === "under_1m")
    conditions.push("COALESCE(ol.raise_maximum, ol.raise_minimum, 0) < 1000000");
  if (filters.raise === "1m_5m")
    conditions.push(
      "COALESCE(ol.raise_maximum, ol.raise_minimum, 0) >= 1000000 AND COALESCE(ol.raise_minimum, ol.raise_maximum, 0) <= 5000000",
    );
  if (filters.raise === "5m_plus")
    conditions.push("COALESCE(ol.raise_maximum, ol.raise_minimum, 0) > 5000000");
  if (filters.minimum === "under_25k")
    conditions.push("COALESCE(ol.minimum_participation, 0) < 25000");
  if (filters.minimum === "25k_100k")
    conditions.push(
      "ol.minimum_participation >= 25000 AND ol.minimum_participation <= 100000",
    );
  if (filters.minimum === "100k_plus")
    conditions.push("ol.minimum_participation > 100000");
  if (["30", "60", "90"].includes(filters.timeline)) {
    conditions.push(
      "ol.closing_at IS NOT NULL AND ol.closing_at > datetime('now') AND ol.closing_at <= datetime('now', ?)",
    );
    values.push(`+${filters.timeline} days`);
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
  if (
    ["saved", "passed", "requested", "approved", "archived"].includes(view) &&
    !verifiedInvestor
  )
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
              ol.traction_stage AS tractionStage,
              ol.closing_at AS closingAt,
              CASE
                WHEN COALESCE(pv.visibility, p.visibility) = 'public'
                  THEN p.display_name
                ELSE 'AKARI Founder'
              END AS founderName,
              ol.updated_at AS updatedAt,
              ous.saved_at AS savedAt, ous.passed_at AS passedAt,
              drr.status AS requestStatus, ol.status AS listingStatus
       FROM opportunity_listings ol
       JOIN projects pr ON pr.id = ol.project_id
       JOIN profiles p ON p.user_id = pr.founder_user_id
       LEFT JOIN profile_visibility pv ON pv.user_id = pr.founder_user_id
       LEFT JOIN opportunity_user_states ous
         ON ous.project_id = pr.id AND ous.user_id = ?
       LEFT JOIN data_room_requests drr
         ON drr.id = (
           SELECT request.id
           FROM data_room_requests request
           WHERE request.project_id = pr.id
             AND request.investor_user_id = ?
           ORDER BY request.created_at DESC, request.id DESC
           LIMIT 1
         )
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
              ol.funding_instrument AS fundingInstrument,
              ol.traction_stage AS tractionStage
       FROM opportunity_listings ol
       JOIN projects pr ON pr.id = ol.project_id
       WHERE ol.status = 'published' AND pr.status = 'published'
       ORDER BY ol.sector, ol.geography, ol.traction_stage`,
    )
    .all<{
      sector: string;
      geography: string;
      fundingInstrument: string;
      tractionStage: string;
    }>();

  return {
    user,
    verifiedInvestor,
    schemaReady: true,
    opportunities: result.results,
    view,
    filters,
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
      tractionStages: [
        ...new Set(
          filterRows.results.map((row) => row.tractionStage).filter(Boolean),
        ),
      ],
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  try {
    await db.prepare("SELECT 1 FROM opportunity_listings LIMIT 1").first();
  } catch (error) {
    if (isOpportunitySchemaUnavailable(error))
      throw new Response("The Deal Rooms are still being activated.", {
        status: 503,
      });
    throw error;
  }
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
            <span className="chapter">Investor and Angel Deal Rooms</span>
            <h1>Considered opportunities, opened with context.</h1>
            <p>
              Explore AKARI-reviewed public previews. Confidential information
              remains closed until eligibility and per-opportunity access are
              confirmed.
            </p>
          </div>
          <aside>
            <strong>Discovery is not endorsement.</strong>
            <p>
              AKARI supports professional discovery and introductions. Members
              remain responsible for independent due diligence and professional
              advice.
            </p>
          </aside>
        </header>

        {!loaderData.schemaReady && (
          <p className="notice applicant-notice" role="status">
            Deal Rooms are temporarily unavailable while the secure catalogue is
            activated. AKARI will not substitute ordinary projects or mock data.
          </p>
        )}
        {!loaderData.verifiedInvestor &&
          loaderData.user?.roles.includes("investor") && (
            <p className="notice applicant-notice">
              Your Investor role is not yet verified. You can review approved
              public previews, while saved lists, archived records and private
              Deal Rooms remain unavailable.
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
                {views.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
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
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Raise range
              <select name="raise" defaultValue={loaderData.filters.raise}>
                <option value="">Any raise range</option>
                <option value="under_1m">Under 1 million</option>
                <option value="1m_5m">1–5 million</option>
                <option value="5m_plus">Over 5 million</option>
              </select>
            </label>
            <label>
              Minimum participation
              <select name="minimum" defaultValue={loaderData.filters.minimum}>
                <option value="">Any minimum</option>
                <option value="under_25k">Under 25,000</option>
                <option value="25k_100k">25,000–100,000</option>
                <option value="100k_plus">Over 100,000</option>
              </select>
            </label>
            <label>
              Traction stage
              <select name="traction" defaultValue={loaderData.filters.traction}>
                <option value="">Any traction stage</option>
                {loaderData.options.tractionStages.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Closing timeline
              <select name="timeline" defaultValue={loaderData.filters.timeline}>
                <option value="">Any timeline</option>
                <option value="30">Within 30 days</option>
                <option value="60">Within 60 days</option>
                <option value="90">Within 90 days</option>
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
              <h2>No approved opportunities match this view.</h2>
              <p>
                Adjust the filters or return to the available catalogue. AKARI
                does not populate this area with placeholder deals.
              </p>
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
                    <span>{opportunity.stage.replaceAll("_", " ")}</span>
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
                      <dd>{opportunity.fundingInstrument.replaceAll("_", " ")}</dd>
                    </div>
                    {range.length > 0 && (
                      <div>
                        <dt>Raise</dt>
                        <dd>{range.join(" – ")}</dd>
                      </div>
                    )}
                    {opportunity.minimumParticipation !== null && (
                      <div>
                        <dt>Minimum</dt>
                        <dd>
                          {money(
                            opportunity.minimumParticipation,
                            opportunity.raiseCurrency,
                          )}
                        </dd>
                      </div>
                    )}
                    {opportunity.tractionStage && (
                      <div>
                        <dt>Traction</dt>
                        <dd>{opportunity.tractionStage}</dd>
                      </div>
                    )}
                    {opportunity.closingAt && (
                      <div>
                        <dt>Closing</dt>
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
                      {opportunity.requestStatus === "approved"
                        ? "Enter Deal Room"
                        : "Review preview"}
                    </Link>
                    {loaderData.verifiedInvestor &&
                      opportunity.listingStatus === "published" && (
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
                    <small>
                      Deal Room access: {opportunity.requestStatus.replaceAll("_", " ")}
                    </small>
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
