import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/project-opportunity";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { recordOpportunityAudit } from "~/lib/opportunity-access.server";
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type ListingRow = {
  sector: string;
  geography: string;
  fundingInstrument: string;
  raiseMinimum: number | null;
  raiseMaximum: number | null;
  raiseCurrency: string;
  minimumParticipation: number | null;
  tractionStage: string;
  closingAt: string | null;
  accessMode: string;
  publicSummary: string;
  publicHighlights: string;
  riskSummary: string;
  status: string;
  decisionNote: string;
};

const instruments = [
  "equity",
  "safe",
  "convertible",
  "token",
  "grant",
  "revenue_share",
  "other",
] as const;

function optionalAmount(value: FormDataEntryValue | null) {
  const text = formText(value).trim();
  if (!text) return null;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : Number.NaN;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });
  const project = await db
    .prepare(
      `SELECT id, slug, title, status
       FROM projects WHERE slug = ? AND founder_user_id = ?`,
    )
    .bind(params.slug, user.id)
    .first<{ id: string; slug: string; title: string; status: string }>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  const listing = await db
    .prepare(
      `SELECT sector, geography, funding_instrument AS fundingInstrument,
              raise_minimum AS raiseMinimum, raise_maximum AS raiseMaximum,
              raise_currency AS raiseCurrency,
              minimum_participation AS minimumParticipation,
              traction_stage AS tractionStage, closing_at AS closingAt,
              access_mode AS accessMode, public_summary AS publicSummary,
              public_highlights AS publicHighlights,
              risk_summary AS riskSummary, status,
              decision_note AS decisionNote
       FROM opportunity_listings WHERE project_id = ?`,
    )
    .bind(project.id)
    .first<ListingRow>();
  return { user, project, listing };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });
  await requireActionRateLimit(
    db,
    request,
    "opportunity-submission",
    user.id,
    20,
    60,
  );
  const project = await db
    .prepare(
      `SELECT id, status FROM projects
       WHERE slug = ? AND founder_user_id = ?`,
    )
    .bind(params.slug, user.id)
    .first<{ id: string; status: string }>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  if (!new Set(["save-draft", "submit"]).has(intent))
    throw new Response("Unsupported action.", { status: 400 });

  const sector = formText(form.get("sector")).trim().slice(0, 80);
  const geography = formText(form.get("geography")).trim().slice(0, 80);
  const fundingInstrument = formText(form.get("fundingInstrument"));
  const raiseMinimum = optionalAmount(form.get("raiseMinimum"));
  const raiseMaximum = optionalAmount(form.get("raiseMaximum"));
  const minimumParticipation = optionalAmount(form.get("minimumParticipation"));
  const raiseCurrency = formText(form.get("raiseCurrency"))
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const tractionStage = formText(form.get("tractionStage")).trim().slice(0, 120);
  const closingAt = formText(form.get("closingAt")).trim() || null;
  const accessMode = formText(form.get("accessMode"));
  const publicSummary = formText(form.get("publicSummary")).trim();
  const publicHighlights = formText(form.get("publicHighlights")).trim();
  const riskSummary = formText(form.get("riskSummary")).trim();

  if (!sector || !geography)
    return { error: "Add both a sector and primary geography." };
  if (!instruments.includes(fundingInstrument as (typeof instruments)[number]))
    return { error: "Choose a supported funding instrument." };
  if (![raiseMinimum, raiseMaximum, minimumParticipation].every((value) => value === null || Number.isFinite(value)))
    return { error: "Amounts must be whole numbers greater than or equal to zero." };
  if (
    raiseMinimum !== null &&
    raiseMaximum !== null &&
    raiseMinimum > raiseMaximum
  )
    return { error: "The minimum raise cannot exceed the maximum raise." };
  if (!/^[A-Z]{3}$/.test(raiseCurrency))
    return { error: "Use a three-letter currency code." };
  if (!new Set(["verified_investors", "approved_only"]).has(accessMode))
    return { error: "Choose a valid private-room access policy." };
  if (publicSummary.length < 20 || publicSummary.length > 1000)
    return { error: "The approved preview must be between 20 and 1,000 characters." };
  if (publicHighlights.length < 20 || publicHighlights.length > 3000)
    return { error: "Highlights must be between 20 and 3,000 characters." };
  if (riskSummary.length < 20 || riskSummary.length > 2000)
    return { error: "Risk information must be between 20 and 2,000 characters." };
  if (intent === "submit" && project.status !== "published")
    return {
      error:
        "The project must be published before an opportunity can be submitted for review.",
    };

  const status = intent === "submit" ? "submitted" : "draft";
  await db
    .prepare(
      `INSERT INTO opportunity_listings
         (project_id, sector, geography, funding_instrument,
          raise_minimum, raise_maximum, raise_currency,
          minimum_participation, traction_stage, closing_at,
          access_mode, public_summary, public_highlights, risk_summary,
          status, submitted_at, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               CASE WHEN ? = 'submitted' THEN datetime('now') ELSE NULL END,
               ?, datetime('now'))
       ON CONFLICT(project_id) DO UPDATE SET
         sector = excluded.sector,
         geography = excluded.geography,
         funding_instrument = excluded.funding_instrument,
         raise_minimum = excluded.raise_minimum,
         raise_maximum = excluded.raise_maximum,
         raise_currency = excluded.raise_currency,
         minimum_participation = excluded.minimum_participation,
         traction_stage = excluded.traction_stage,
         closing_at = excluded.closing_at,
         access_mode = excluded.access_mode,
         public_summary = excluded.public_summary,
         public_highlights = excluded.public_highlights,
         risk_summary = excluded.risk_summary,
         status = excluded.status,
         submitted_at = excluded.submitted_at,
         reviewed_by = NULL,
         reviewed_at = NULL,
         decision_note = '',
         updated_at = datetime('now')`,
    )
    .bind(
      project.id,
      sector,
      geography,
      fundingInstrument,
      raiseMinimum,
      raiseMaximum,
      raiseCurrency,
      minimumParticipation,
      tractionStage,
      closingAt,
      accessMode,
      publicSummary,
      publicHighlights,
      riskSummary,
      status,
      status,
      user.id,
    )
    .run();
  await recordOpportunityAudit(
    db,
    user.id,
    intent === "submit" ? "opportunity.submitted" : "opportunity.draft_saved",
    project.id,
  );
  throw redirect(`/projects/${params.slug}/opportunity?saved=${status}`);
}

export default function ProjectOpportunity({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const listing = loaderData.listing;
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main opportunity-editor-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Founder opportunity submission</span>
            <h1>{loaderData.project.title}</h1>
            <p>
              Prepare an approved preview and a controlled private-room policy.
              Submissions remain unavailable to Investors until AKARI review.
            </p>
          </div>
          <Link className="button button-quiet" to={`/projects/${loaderData.project.slug}`}>
            Return to project
          </Link>
        </header>

        {listing && (
          <p className="notice applicant-notice">
            Current review state: <strong>{listing.status}</strong>
            {listing.decisionNote ? ` · ${listing.decisionNote}` : ""}
          </p>
        )}
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <Form method="post" className="form-stack opportunity-editor-form">
          <div className="form-grid">
            <label>
              Sector
              <input name="sector" defaultValue={listing?.sector} maxLength={80} required />
            </label>
            <label>
              Primary geography
              <input
                name="geography"
                defaultValue={listing?.geography}
                maxLength={80}
                required
              />
            </label>
            <label>
              Funding instrument
              <select
                name="fundingInstrument"
                defaultValue={listing?.fundingInstrument || "other"}
              >
                {instruments.map((instrument) => (
                  <option key={instrument} value={instrument}>
                    {instrument.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Currency
              <input
                name="raiseCurrency"
                defaultValue={listing?.raiseCurrency || "USD"}
                minLength={3}
                maxLength={3}
                required
              />
            </label>
            <label>
              Raise minimum
              <input
                name="raiseMinimum"
                type="number"
                min="0"
                step="1"
                defaultValue={listing?.raiseMinimum ?? ""}
              />
            </label>
            <label>
              Raise maximum
              <input
                name="raiseMaximum"
                type="number"
                min="0"
                step="1"
                defaultValue={listing?.raiseMaximum ?? ""}
              />
            </label>
            <label>
              Minimum participation
              <input
                name="minimumParticipation"
                type="number"
                min="0"
                step="1"
                defaultValue={listing?.minimumParticipation ?? ""}
              />
            </label>
            <label>
              Current closing timeline
              <input
                name="closingAt"
                type="date"
                defaultValue={listing?.closingAt?.slice(0, 10) || ""}
              />
            </label>
            <label>
              Traction stage
              <input
                name="tractionStage"
                defaultValue={listing?.tractionStage}
                maxLength={120}
              />
            </label>
            <label>
              Private-room policy
              <select
                name="accessMode"
                defaultValue={listing?.accessMode || "approved_only"}
              >
                <option value="approved_only">Per-opportunity approval</option>
                <option value="verified_investors">All verified Investors</option>
              </select>
            </label>
          </div>

          <label>
            Approved public preview
            <textarea
              name="publicSummary"
              minLength={20}
              maxLength={1000}
              rows={5}
              defaultValue={listing?.publicSummary}
              required
            />
          </label>
          <label>
            Approved public highlights
            <textarea
              name="publicHighlights"
              minLength={20}
              maxLength={3000}
              rows={8}
              defaultValue={listing?.publicHighlights}
              required
            />
          </label>
          <label>
            Risk information
            <textarea
              name="riskSummary"
              minLength={20}
              maxLength={2000}
              rows={6}
              defaultValue={listing?.riskSummary}
              required
            />
          </label>

          <div className="deal-action-row">
            <button className="button button-quiet" name="intent" value="save-draft">
              Save private draft
            </button>
            <button className="button button-primary" name="intent" value="submit">
              Submit for AKARI review
            </button>
          </div>
        </Form>
      </main>
    </div>
  );
}
