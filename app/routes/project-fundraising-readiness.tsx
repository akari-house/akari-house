import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-fundraising-readiness";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  calculateFundraisingReadiness,
  fundraisingStatusLabels,
  type FundraisingStatus,
} from "~/lib/fundraising-readiness";
import { requireProjectManagerBySlug } from "~/lib/project-access.server";
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import { isRoleVerifiedId } from "~/lib/role-verification.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

const instruments = [
  "equity",
  "safe",
  "convertible",
  "token",
  "grant",
  "revenue_share",
  "other",
] as const;

const revenuePeriods = ["monthly", "annual", "lifetime", "other"] as const;

type ProfileRow = {
  raiseTarget: number | null;
  raiseCurrency: string;
  valuation: number | null;
  fundingInstrument: string;
  minimumParticipation: number | null;
  tractionSummary: string;
  keyMetrics: string;
  useOfFunds: string;
  monthlyBurn: number | null;
  runwayMonths: number | null;
  currentRevenue: number | null;
  revenuePeriod: string;
  capTableReference: string;
  pitchDeckReference: string;
  onePagerReference: string;
  financialsReference: string;
  corporateDocsReference: string;
  tokenRelevant: number;
  tokenomicsReference: string;
  closingTarget: string | null;
  readinessStatus: FundraisingStatus;
  reviewNote: string;
};

const emptyProfile: ProfileRow = {
  raiseTarget: null,
  raiseCurrency: "USD",
  valuation: null,
  fundingInstrument: "other",
  minimumParticipation: null,
  tractionSummary: "",
  keyMetrics: "",
  useOfFunds: "",
  monthlyBurn: null,
  runwayMonths: null,
  currentRevenue: null,
  revenuePeriod: "monthly",
  capTableReference: "",
  pitchDeckReference: "",
  onePagerReference: "",
  financialsReference: "",
  corporateDocsReference: "",
  tokenRelevant: 0,
  tokenomicsReference: "",
  closingTarget: null,
  readinessStatus: "in_preparation",
  reviewNote: "",
};

function optionalInteger(value: FormDataEntryValue | null) {
  const text = formText(value).trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= 0 ? number : Number.NaN;
}

function optionalDate(value: FormDataEntryValue | null) {
  const text = formText(value).trim();
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function optionalReference(value: FormDataEntryValue | null) {
  const text = formText(value).trim();
  if (!text) return "";
  if (text.length > 1000) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function documentMatches(titles: string[], patterns: RegExp[]) {
  return titles.some((title) => patterns.some((pattern) => pattern.test(title)));
}

function readinessFor(
  project: { status: string; summary: string; description: string; stage: string },
  profile: ProfileRow,
  founderVerified: boolean,
  documentTitles: string[],
) {
  const capTableReady =
    Boolean(profile.capTableReference) ||
    documentMatches(documentTitles, [/cap\s*table/i, /ownership/i]);
  const pitchDeckReady =
    Boolean(profile.pitchDeckReference) ||
    documentMatches(documentTitles, [/pitch/i, /deck/i]);
  const onePagerReady =
    Boolean(profile.onePagerReference) ||
    documentMatches(documentTitles, [/one[- ]?pager/i, /overview/i]);
  const financialsReady =
    Boolean(profile.financialsReference) ||
    documentMatches(documentTitles, [/financial/i, /p&l/i, /profit/i, /cash flow/i]);
  const corporateDocsReady =
    Boolean(profile.corporateDocsReference) ||
    documentMatches(documentTitles, [/corporate/i, /incorpor/i, /legal/i, /registration/i]);
  const tokenomicsReady =
    Boolean(profile.tokenomicsReference) || documentMatches(documentTitles, [/tokenomics/i]);

  return calculateFundraisingReadiness({
    projectProfileComplete:
      project.status === "published" &&
      project.summary.trim().length >= 20 &&
      project.description.trim().length >= 50 &&
      Boolean(project.stage),
    founderVerified,
    raiseTarget: profile.raiseTarget,
    raiseCurrency: profile.raiseCurrency,
    fundingInstrument: profile.fundingInstrument,
    tractionSummary: profile.tractionSummary,
    keyMetrics: profile.keyMetrics,
    useOfFunds: profile.useOfFunds,
    monthlyBurn: profile.monthlyBurn,
    runwayMonths: profile.runwayMonths,
    capTableReady,
    pitchDeckReady,
    onePagerReady,
    financialsReady,
    corporateDocsReady,
    tokenRelevant: Boolean(profile.tokenRelevant),
    tokenomicsReady,
  });
}

async function loadWorkspace(db: D1Database, projectId: string) {
  const project = await db
    .prepare(
      `SELECT id, slug, title, summary, description, stage, status,
              founder_user_id AS founderUserId
       FROM projects WHERE id = ?`,
    )
    .bind(projectId)
    .first<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      description: string;
      stage: string;
      status: string;
      founderUserId: string;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });

  const [profile, documents, founderVerified, opportunity] = await Promise.all([
    db
      .prepare(
        `SELECT raise_target AS raiseTarget, raise_currency AS raiseCurrency,
                valuation, funding_instrument AS fundingInstrument,
                minimum_participation AS minimumParticipation,
                traction_summary AS tractionSummary, key_metrics AS keyMetrics,
                use_of_funds AS useOfFunds, monthly_burn AS monthlyBurn,
                runway_months AS runwayMonths, current_revenue AS currentRevenue,
                revenue_period AS revenuePeriod,
                cap_table_reference AS capTableReference,
                pitch_deck_reference AS pitchDeckReference,
                one_pager_reference AS onePagerReference,
                financials_reference AS financialsReference,
                corporate_docs_reference AS corporateDocsReference,
                token_relevant AS tokenRelevant,
                tokenomics_reference AS tokenomicsReference,
                closing_target AS closingTarget,
                readiness_status AS readinessStatus,
                review_note AS reviewNote
         FROM project_fundraising_profiles WHERE project_id = ?`,
      )
      .bind(project.id)
      .first<ProfileRow>(),
    db
      .prepare("SELECT title FROM project_documents WHERE project_id = ?")
      .bind(project.id)
      .all<{ title: string }>(),
    isRoleVerifiedId(db, project.founderUserId, "founder"),
    db
      .prepare("SELECT status FROM opportunity_listings WHERE project_id = ?")
      .bind(project.id)
      .first<{ status: string }>(),
  ]);

  const mergedProfile = profile ?? emptyProfile;
  const readiness = readinessFor(
    project,
    mergedProfile,
    founderVerified,
    documents.results.map((document) => document.title),
  );

  return {
    project,
    profile: mergedProfile,
    founderVerified,
    readiness,
    opportunityStatus: opportunity?.status ?? null,
  };
}

export const meta: Route.MetaFunction = () => [
  { title: "Fundraising Readiness | AKARI House" },
  {
    name: "description",
    content:
      "Founder fundraising preparation and operational completeness workspace.",
  },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });
  const access = await requireProjectManagerBySlug(db, params.slug, user.id);
  return { user, ...(await loadWorkspace(db, access.projectId)) };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });
  const access = await requireProjectManagerBySlug(db, params.slug, user.id);
  await requireActionRateLimit(
    db,
    request,
    "fundraising-readiness",
    user.id,
    30,
    60,
  );
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "prepare-opportunity") {
    const workspace = await loadWorkspace(db, access.projectId);
    if (!workspace.readiness.canPrepareOpportunity)
      return {
        error:
          "Complete at least 80% of the readiness checklist, publish the project and complete Founder verification before preparing investor outreach.",
      };
    if (workspace.opportunityStatus)
      throw redirect(`/projects/${workspace.project.slug}/opportunity`);

    await db
      .prepare(
        `INSERT INTO opportunity_listings
           (project_id, funding_instrument, raise_maximum, raise_currency,
            minimum_participation, traction_stage, status, created_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, datetime('now'))`,
      )
      .bind(
        workspace.project.id,
        workspace.profile.fundingInstrument,
        workspace.profile.raiseTarget,
        workspace.profile.raiseCurrency,
        workspace.profile.minimumParticipation,
        workspace.project.stage,
        user.id,
      )
      .run();
    throw redirect(`/projects/${workspace.project.slug}/opportunity?from=readiness`);
  }

  if (intent !== "save") throw new Response("Unsupported action.", { status: 400 });

  const amounts = {
    raiseTarget: optionalInteger(form.get("raiseTarget")),
    valuation: optionalInteger(form.get("valuation")),
    minimumParticipation: optionalInteger(form.get("minimumParticipation")),
    monthlyBurn: optionalInteger(form.get("monthlyBurn")),
    runwayMonths: optionalInteger(form.get("runwayMonths")),
    currentRevenue: optionalInteger(form.get("currentRevenue")),
  };
  if (Object.values(amounts).some((value) => Number.isNaN(value)))
    return { error: "Financial amounts must be whole numbers greater than or equal to zero." };

  const raiseCurrency = formText(form.get("raiseCurrency")).trim().toUpperCase();
  const fundingInstrument = formText(form.get("fundingInstrument"));
  const revenuePeriod = formText(form.get("revenuePeriod"));
  const closingTarget = optionalDate(form.get("closingTarget"));
  if (!/^[A-Z]{3}$/.test(raiseCurrency))
    return { error: "Use a three-letter currency code such as USD or EUR." };
  if (!instruments.includes(fundingInstrument as (typeof instruments)[number]))
    return { error: "Choose a supported funding instrument." };
  if (!revenuePeriods.includes(revenuePeriod as (typeof revenuePeriods)[number]))
    return { error: "Choose a supported revenue period." };
  if (closingTarget === undefined) return { error: "Use a valid closing target date." };

  const references = {
    capTableReference: optionalReference(form.get("capTableReference")),
    pitchDeckReference: optionalReference(form.get("pitchDeckReference")),
    onePagerReference: optionalReference(form.get("onePagerReference")),
    financialsReference: optionalReference(form.get("financialsReference")),
    corporateDocsReference: optionalReference(form.get("corporateDocsReference")),
    tokenomicsReference: optionalReference(form.get("tokenomicsReference")),
  };
  if (Object.values(references).some((value) => value === undefined))
    return { error: "Document references must be valid HTTPS links." };

  const tractionSummary = formText(form.get("tractionSummary")).trim().slice(0, 3000);
  const keyMetrics = formText(form.get("keyMetrics")).trim().slice(0, 3000);
  const useOfFunds = formText(form.get("useOfFunds")).trim().slice(0, 3000);
  const tokenRelevant = form.get("tokenRelevant") === "on" ? 1 : 0;

  await db
    .prepare(
      `INSERT INTO project_fundraising_profiles
         (project_id, raise_target, raise_currency, valuation, funding_instrument,
          minimum_participation, traction_summary, key_metrics, use_of_funds,
          monthly_burn, runway_months, current_revenue, revenue_period,
          cap_table_reference, pitch_deck_reference, one_pager_reference,
          financials_reference, corporate_docs_reference, token_relevant,
          tokenomics_reference, closing_target, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(project_id) DO UPDATE SET
         raise_target = excluded.raise_target,
         raise_currency = excluded.raise_currency,
         valuation = excluded.valuation,
         funding_instrument = excluded.funding_instrument,
         minimum_participation = excluded.minimum_participation,
         traction_summary = excluded.traction_summary,
         key_metrics = excluded.key_metrics,
         use_of_funds = excluded.use_of_funds,
         monthly_burn = excluded.monthly_burn,
         runway_months = excluded.runway_months,
         current_revenue = excluded.current_revenue,
         revenue_period = excluded.revenue_period,
         cap_table_reference = excluded.cap_table_reference,
         pitch_deck_reference = excluded.pitch_deck_reference,
         one_pager_reference = excluded.one_pager_reference,
         financials_reference = excluded.financials_reference,
         corporate_docs_reference = excluded.corporate_docs_reference,
         token_relevant = excluded.token_relevant,
         tokenomics_reference = excluded.tokenomics_reference,
         closing_target = excluded.closing_target,
         CASE WHEN readiness_status = 'ready_for_outreach' THEN
           readiness_status = 'in_preparation'
         END,
         updated_at = datetime('now')`,
    )
    .bind(
      access.projectId,
      amounts.raiseTarget,
      raiseCurrency,
      amounts.valuation,
      fundingInstrument,
      amounts.minimumParticipation,
      tractionSummary,
      keyMetrics,
      useOfFunds,
      amounts.monthlyBurn,
      amounts.runwayMonths,
      amounts.currentRevenue,
      revenuePeriod,
      references.capTableReference,
      references.pitchDeckReference,
      references.onePagerReference,
      references.financialsReference,
      references.corporateDocsReference,
      tokenRelevant,
      references.tokenomicsReference,
      closingTarget,
    )
    .run();
  throw redirect(`/projects/${params.slug}/fundraising?saved=1`);
}

function moneyValue(value: number | null) {
  return value === null ? "" : String(value);
}

export default function ProjectFundraisingReadiness({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const profile = loaderData.profile;
  const readiness = loaderData.readiness;

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main opportunity-editor-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Founder fundraising readiness</span>
            <h1>{loaderData.project.title}</h1>
            <p>
              Prepare the operational information AKARI needs before investor outreach.
              The readiness score measures completeness only. It is not an investment rating.
            </p>
          </div>
          <div className="button-row">
            <Link className="button button-quiet" to="/projects/manage">
              Project desk
            </Link>
            <Link className="button button-quiet" to={`/projects/${loaderData.project.slug}/diligence`}>
              Private documents
            </Link>
          </div>
        </header>

        {actionData?.error ? <div className="status-card status-card-warning">{actionData.error}</div> : null}

        <section className="status-card">
          <span className="eyebrow">Operational completeness</span>
          <h2>{readiness.score}% fundraising ready</h2>
          <p>
            {readiness.completed} of {readiness.total} readiness checks complete · Review status:{" "}
            {fundraisingStatusLabels[profile.readinessStatus]}
          </p>
          <div className="project-grid">
            {readiness.items.map((item) => (
              <article className="project-card" key={item.key}>
                <span className="chapter">{item.complete ? "Ready" : "Needs attention"}</span>
                <h3>{item.label}</h3>
                {!item.complete ? <p>{item.guidance}</p> : <p>Operational requirement recorded.</p>}
              </article>
            ))}
          </div>
          {profile.reviewNote ? <p><strong>AKARI review note:</strong> {profile.reviewNote}</p> : null}
        </section>

        <Form method="post" className="admin-form-stack">
          <input type="hidden" name="intent" value="save" />

          <section className="status-card">
            <span className="eyebrow">1 · Raise</span>
            <h2>Fundraising structure</h2>
            <div className="form-grid">
              <label>Raise target<input name="raiseTarget" inputMode="numeric" defaultValue={moneyValue(profile.raiseTarget)} /></label>
              <label>Currency<input name="raiseCurrency" maxLength={3} defaultValue={profile.raiseCurrency} /></label>
              <label>Valuation, if applicable<input name="valuation" inputMode="numeric" defaultValue={moneyValue(profile.valuation)} /></label>
              <label>Funding instrument<select name="fundingInstrument" defaultValue={profile.fundingInstrument}>{instruments.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
              <label>Minimum participation<input name="minimumParticipation" inputMode="numeric" defaultValue={moneyValue(profile.minimumParticipation)} /></label>
              <label>Target close<input name="closingTarget" type="date" defaultValue={profile.closingTarget ?? ""} /></label>
            </div>
          </section>

          <section className="status-card">
            <span className="eyebrow">2 · Traction</span>
            <h2>Evidence of progress</h2>
            <label>Traction summary<textarea name="tractionSummary" rows={5} defaultValue={profile.tractionSummary} placeholder="Customers, users, product progress, distribution, partnerships or other relevant traction." /></label>
            <label>Key metrics<textarea name="keyMetrics" rows={4} defaultValue={profile.keyMetrics} placeholder="Record the measurable metrics that matter for this company and stage." /></label>
          </section>

          <section className="status-card">
            <span className="eyebrow">3 · Financial readiness</span>
            <h2>Runway and use of funds</h2>
            <div className="form-grid">
              <label>Monthly burn<input name="monthlyBurn" inputMode="numeric" defaultValue={moneyValue(profile.monthlyBurn)} /></label>
              <label>Runway in months<input name="runwayMonths" inputMode="numeric" defaultValue={moneyValue(profile.runwayMonths)} /></label>
              <label>Current revenue<input name="currentRevenue" inputMode="numeric" defaultValue={moneyValue(profile.currentRevenue)} /></label>
              <label>Revenue period<select name="revenuePeriod" defaultValue={profile.revenuePeriod}>{revenuePeriods.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            </div>
            <label>Use of funds<textarea name="useOfFunds" rows={5} defaultValue={profile.useOfFunds} placeholder="Explain the main allocation areas and milestones this raise is expected to unlock." /></label>
          </section>

          <section className="status-card">
            <span className="eyebrow">4 · Investor materials</span>
            <h2>External references</h2>
            <p>Use HTTPS links to the current source documents. AKARI records the reference and workflow; it does not replace your source document system.</p>
            <div className="form-grid">
              <label>Cap table<input name="capTableReference" type="url" defaultValue={profile.capTableReference} placeholder="https://" /></label>
              <label>Pitch deck<input name="pitchDeckReference" type="url" defaultValue={profile.pitchDeckReference} placeholder="https://" /></label>
              <label>One-pager<input name="onePagerReference" type="url" defaultValue={profile.onePagerReference} placeholder="https://" /></label>
              <label>Financials<input name="financialsReference" type="url" defaultValue={profile.financialsReference} placeholder="https://" /></label>
              <label>Corporate / legal docs<input name="corporateDocsReference" type="url" defaultValue={profile.corporateDocsReference} placeholder="https://" /></label>
            </div>
            <label className="checkbox-row"><input name="tokenRelevant" type="checkbox" defaultChecked={Boolean(profile.tokenRelevant)} /> This project has a token or token-related fundraising component.</label>
            <label>Tokenomics, when relevant<input name="tokenomicsReference" type="url" defaultValue={profile.tokenomicsReference} placeholder="https://" /></label>
          </section>

          <div className="button-row">
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save fundraising readiness"}</button>
          </div>
        </Form>

        <section className="status-card">
          <span className="eyebrow">Next step</span>
          <h2>Prepare the Investor Opportunity</h2>
          {loaderData.opportunityStatus ? (
            <div className="button-row">
              <p>Existing opportunity status: {loaderData.opportunityStatus.replaceAll("_", " ")}</p>
              <Link className="button button-primary" to={`/projects/${loaderData.project.slug}/opportunity`}>Open investor opportunity</Link>
            </div>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="prepare-opportunity" />
              <p>At 80%+ completeness, with a published project and verified Founder, AKARI can create a draft in the existing investor-opportunity workflow using your recorded raise data.</p>
              <button className="button button-primary" type="submit" disabled={!readiness.canPrepareOpportunity || busy}>Prepare investor opportunity</button>
            </Form>
          )}
        </section>
      </main>
    </div>
  );
}
