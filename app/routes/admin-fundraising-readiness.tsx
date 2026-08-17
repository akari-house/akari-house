import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-fundraising-readiness";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import {
  calculateFundraisingReadiness,
  fundraisingStatusLabels,
  fundraisingStatuses,
  isFundraisingStatus,
  type FundraisingStatus,
} from "~/lib/fundraising-readiness";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type ReadinessRow = {
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  projectSummary: string;
  projectDescription: string;
  projectStage: string;
  projectStatus: string;
  founderUserId: string;
  founderName: string;
  founderUsername: string;
  founderVerified: number;
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
  capTableReference: string;
  pitchDeckReference: string;
  onePagerReference: string;
  financialsReference: string;
  corporateDocsReference: string;
  tokenRelevant: number;
  tokenomicsReference: string;
  readinessStatus: FundraisingStatus;
  reviewNote: string;
  documentTitles: string;
  opportunityStatus: string | null;
  updatedAt: string;
};

function documentMatches(titles: string[], patterns: RegExp[]) {
  return titles.some((title) =>
    patterns.some((pattern) => pattern.test(title)),
  );
}

function readinessFor(row: ReadinessRow) {
  const titles = row.documentTitles ? row.documentTitles.split(" | ") : [];
  return calculateFundraisingReadiness({
    projectProfileComplete:
      row.projectStatus === "published" &&
      row.projectSummary.trim().length >= 20 &&
      row.projectDescription.trim().length >= 50 &&
      Boolean(row.projectStage),
    founderVerified: Boolean(row.founderVerified),
    raiseTarget: row.raiseTarget,
    raiseCurrency: row.raiseCurrency,
    fundingInstrument: row.fundingInstrument,
    tractionSummary: row.tractionSummary,
    keyMetrics: row.keyMetrics,
    useOfFunds: row.useOfFunds,
    monthlyBurn: row.monthlyBurn,
    runwayMonths: row.runwayMonths,
    capTableReady:
      Boolean(row.capTableReference) ||
      documentMatches(titles, [/cap\s*table/i, /ownership/i]),
    pitchDeckReady:
      Boolean(row.pitchDeckReference) ||
      documentMatches(titles, [/pitch/i, /deck/i]),
    onePagerReady:
      Boolean(row.onePagerReference) ||
      documentMatches(titles, [/one[- ]?pager/i, /overview/i]),
    financialsReady:
      Boolean(row.financialsReference) ||
      documentMatches(titles, [/financial/i, /p&l/i, /profit/i, /cash flow/i]),
    corporateDocsReady:
      Boolean(row.corporateDocsReference) ||
      documentMatches(titles, [
        /corporate/i,
        /incorpor/i,
        /legal/i,
        /registration/i,
      ]),
    tokenRelevant: Boolean(row.tokenRelevant),
    tokenomicsReady:
      Boolean(row.tokenomicsReference) ||
      documentMatches(titles, [/tokenomics/i]),
  });
}

async function getRows(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT fp.project_id AS projectId, pr.slug AS projectSlug,
              pr.title AS projectTitle, pr.summary AS projectSummary,
              pr.description AS projectDescription, pr.stage AS projectStage,
              pr.status AS projectStatus, pr.founder_user_id AS founderUserId,
              COALESCE(p.display_name, u.username) AS founderName,
              u.username AS founderUsername,
              CASE WHEN EXISTS (
                SELECT 1 FROM role_verifications rv
                WHERE rv.user_id = pr.founder_user_id
                  AND rv.role = 'founder' AND rv.status = 'verified'
              ) THEN 1 ELSE 0 END AS founderVerified,
              fp.raise_target AS raiseTarget, fp.raise_currency AS raiseCurrency,
              fp.valuation, fp.funding_instrument AS fundingInstrument,
              fp.minimum_participation AS minimumParticipation,
              fp.traction_summary AS tractionSummary, fp.key_metrics AS keyMetrics,
              fp.use_of_funds AS useOfFunds, fp.monthly_burn AS monthlyBurn,
              fp.runway_months AS runwayMonths, fp.current_revenue AS currentRevenue,
              fp.cap_table_reference AS capTableReference,
              fp.pitch_deck_reference AS pitchDeckReference,
              fp.one_pager_reference AS onePagerReference,
              fp.financials_reference AS financialsReference,
              fp.corporate_docs_reference AS corporateDocsReference,
              fp.token_relevant AS tokenRelevant,
              fp.tokenomics_reference AS tokenomicsReference,
              fp.readiness_status AS readinessStatus,
              fp.review_note AS reviewNote,
              COALESCE(GROUP_CONCAT(pd.title, ' | '), '') AS documentTitles,
              MAX(ol.status) AS opportunityStatus,
              fp.updated_at AS updatedAt
       FROM project_fundraising_profiles fp
       JOIN projects pr ON pr.id = fp.project_id
       JOIN users u ON u.id = pr.founder_user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN project_documents pd ON pd.project_id = pr.id
       LEFT JOIN opportunity_listings ol ON ol.project_id = pr.id
       GROUP BY fp.project_id
       ORDER BY fp.updated_at DESC`,
    )
    .all<ReadinessRow>();
  return result.results;
}

export const meta: Route.MetaFunction = () => [
  { title: "Fundraising Readiness Review | AKARI House" },
  {
    name: "description",
    content: "Internal review of Founder fundraising operational completeness.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);
  const rows = await getRows(db);
  return {
    user,
    access,
    rows: rows.map((row) => ({ ...row, readiness: readinessFor(row) })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const form = await request.formData();
  const projectId = formText(form.get("projectId"));
  const readinessStatus = formText(form.get("readinessStatus"));
  const reviewNote = formText(form.get("reviewNote")).trim().slice(0, 3000);
  if (!projectId || !isFundraisingStatus(readinessStatus))
    return { error: "Choose a valid project and review status." };

  const rows = await getRows(db);
  const row = rows.find((candidate) => candidate.projectId === projectId);
  if (!row) return { error: "Fundraising profile not found." };
  const readiness = readinessFor(row);
  if (
    readinessStatus === "ready_for_outreach" &&
    !readiness.canPrepareOpportunity
  )
    return {
      error:
        "This project cannot be marked ready for outreach until it reaches 80% completeness, is published and the Founder is verified.",
    };

  await db
    .prepare(
      `UPDATE project_fundraising_profiles
       SET readiness_status = ?, review_note = ?, reviewed_by = ?,
           reviewed_at = datetime('now'), updated_at = datetime('now')
       WHERE project_id = ?`,
    )
    .bind(readinessStatus, reviewNote, user.id, projectId)
    .run();
  return { saved: true };
}

function moneyLabel(amount: number | null, currency: string) {
  if (amount === null) return "Not set";
  return `${currency} ${new Intl.NumberFormat("en").format(amount)}`;
}

export default function AdminFundraisingReadiness({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <AdminWorkspaceNav access={loaderData.access} />
        <header className="admin-heading">
          <div>
            <span className="eyebrow">R71 · Founder readiness</span>
            <h1>Fundraising readiness review</h1>
            <p>
              Review operational completeness before investor outreach. The
              score is a workflow measure, not an investment rating or
              recommendation.
            </p>
          </div>
        </header>

        {actionData?.error ? (
          <div className="status-card status-card-warning">
            {actionData.error}
          </div>
        ) : null}
        {actionData?.saved ? (
          <div className="status-card">Readiness review updated.</div>
        ) : null}

        <div className="project-grid">
          {loaderData.rows.length ? (
            loaderData.rows.map((row) => (
              <article className="project-card" key={row.projectId}>
                <span className="chapter">
                  {row.readiness.score}% complete ·{" "}
                  {fundraisingStatusLabels[row.readinessStatus]}
                </span>
                <h2>{row.projectTitle}</h2>
                <p>
                  Founder: {row.founderName} (@{row.founderUsername})
                </p>
                <p>
                  Raise: {moneyLabel(row.raiseTarget, row.raiseCurrency)} ·{" "}
                  {row.fundingInstrument.replaceAll("_", " ")}
                </p>
                <p>
                  Missing:{" "}
                  {row.readiness.missing.length
                    ? row.readiness.missing.map((item) => item.label).join(", ")
                    : "No checklist items"}
                </p>
                <p>
                  Investor opportunity:{" "}
                  {row.opportunityStatus?.replaceAll("_", " ") ??
                    "Not prepared"}
                </p>
                <div className="button-row">
                  <Link to={`/projects/${row.projectSlug}/fundraising`}>
                    Founder workspace
                  </Link>
                  <Link to={`/projects/${row.projectSlug}/opportunity`}>
                    Investor opportunity
                  </Link>
                  <Link to={`/projects/${row.projectSlug}/diligence`}>
                    Diligence
                  </Link>
                </div>
                <Form method="post" className="admin-form-stack">
                  <input type="hidden" name="projectId" value={row.projectId} />
                  <label>
                    Review status
                    <select
                      name="readinessStatus"
                      defaultValue={row.readinessStatus}
                    >
                      {fundraisingStatuses.map((status) => (
                        <option key={status} value={status}>
                          {fundraisingStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Internal review note
                    <textarea
                      name="reviewNote"
                      rows={3}
                      defaultValue={row.reviewNote}
                    />
                  </label>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={busy}
                  >
                    {busy ? "Updating…" : "Update review"}
                  </button>
                </Form>
              </article>
            ))
          ) : (
            <div className="status-card">
              <h2>No fundraising profiles yet.</h2>
              <p>
                Founder fundraising workspaces will appear here after a project
                saves its first readiness profile.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
