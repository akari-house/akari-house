import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin-iio-detail";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { distributeIioBudget } from "~/lib/iio-scoring";
import {
  createOrRefreshIioSheet,
  importIioSheetReviews,
} from "~/lib/google-sheets.server";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type Applicant = {
  id: string;
  creatorUserId: string;
  creatorName: string;
  username: string;
  status: string;
  xUrl: string;
  tiktokUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  xFollowers: number;
  xScore: number;
  sorsaScore: number;
  akariScore: number;
  payoutCents: number;
  payoutPercent: number;
};

async function getIio(db: D1Database, slug: string | undefined) {
  return db
    .prepare(
      `SELECT c.id, c.slug, c.title, c.summary, c.brief, c.deliverables,
              c.status, c.application_deadline AS applicationDeadline,
              c.budget_cents AS budgetCents, c.currency,
              c.weight_followers AS weightFollowers,
              c.weight_x_score AS weightXScore,
              c.weight_sorsa_score AS weightSorsaScore,
              c.finalized_at AS finalizedAt, p.title AS projectTitle
       FROM ambassador_campaigns c
       JOIN projects p ON p.id = c.project_id
       WHERE c.slug = ? AND c.campaign_kind = 'iio'`,
    )
    .bind(slug)
    .first<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      brief: string;
      deliverables: string;
      status: string;
      applicationDeadline: string | null;
      budgetCents: number;
      currency: string;
      weightFollowers: number;
      weightXScore: number;
      weightSorsaScore: number;
      finalizedAt: string | null;
      projectTitle: string;
    }>();
}

async function getApplicants(db: D1Database, campaignId: string) {
  const result = await db
    .prepare(
      `SELECT ca.id, ca.creator_user_id AS creatorUserId,
              COALESCE(NULLIF(ca.creator_name, ''), p.display_name) AS creatorName,
              u.username, ca.status,
              ca.x_url AS xUrl, ca.tiktok_url AS tiktokUrl,
              ca.instagram_url AS instagramUrl, ca.youtube_url AS youtubeUrl,
              ca.x_followers AS xFollowers, ca.x_score AS xScore,
              ca.sorsa_score AS sorsaScore, ca.akari_score AS akariScore,
              ca.payout_cents AS payoutCents,
              ca.payout_percent AS payoutPercent
       FROM campaign_applications ca
       JOIN users u ON u.id = ca.creator_user_id
       JOIN profiles p ON p.user_id = ca.creator_user_id
       WHERE ca.campaign_id = ? AND ca.status <> 'withdrawn'
       ORDER BY ca.created_at`,
    )
    .bind(campaignId)
    .all<Applicant>();
  return result.results;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "campaigns");
  const campaign = await getIio(db, params.slug);
  if (!campaign) throw new Response("IIO not found.", { status: 404 });
  const [googleConnection, googleSheet] = await Promise.all([
    db
      .prepare("SELECT 1 FROM google_connections WHERE user_id = ?")
      .bind(user.id)
      .first(),
    db
      .prepare(
        `SELECT spreadsheet_url AS spreadsheetUrl
         FROM iio_google_sheets WHERE campaign_id = ?`,
      )
      .bind(campaign.id)
      .first<{ spreadsheetUrl: string }>(),
  ]);
  return {
    user,
    campaign,
    applicants: await getApplicants(db, campaign.id),
    googleConnected: Boolean(googleConnection),
    googleSheet,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { env } = context.get(cloudflareContext);
  const db = env.DB;
  const admin = await requireAdminScope(request, db, "campaigns");
  const campaign = await getIio(db, params.slug);
  if (!campaign) throw new Response("IIO not found.", { status: 404 });
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "google-sheet-import") {
    if (campaign.finalizedAt)
      return { error: "Finalized campaign decisions cannot be changed." };
    try {
      const imported = await importIioSheetReviews(
        db,
        admin.id,
        campaign.id,
        env,
      );
      await db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'iio.google_sheet_imported', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          campaign.id,
          JSON.stringify({ imported }),
        )
        .run();
      return { imported };
    } catch (error) {
      console.error("Google Sheet import failed", error);
      return {
        error:
          error instanceof Error
            ? error.message
            : "Google Sheet decisions could not be imported.",
      };
    }
  }

  if (intent === "google-sheet") {
    const applicants = await getApplicants(db, campaign.id);
    try {
      const sheet = await createOrRefreshIioSheet(
        db,
        admin.id,
        campaign,
        applicants,
        env,
      );
      await db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'iio.google_sheet_synced', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          campaign.id,
          JSON.stringify({ spreadsheetId: sheet.spreadsheetId }),
        )
        .run();
      throw redirect(`/admin/iio/${campaign.slug}?sheet=1`);
    } catch (error) {
      if (error instanceof Response) throw error;
      console.error("Google Sheet sync failed", error);
      return {
        error:
          error instanceof Error
            ? error.message
            : "Google Sheet could not be created.",
      };
    }
  }

  if (intent === "publish" || intent === "close") {
    const status = intent === "publish" ? "published" : "closed";
    await db.batch([
      db
        .prepare(
          `UPDATE ambassador_campaigns SET status = ?, reviewed_by = ?,
           reviewed_at = COALESCE(reviewed_at, datetime('now')),
           updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(status, admin.id, campaign.id),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'iio.status_changed', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          campaign.id,
          JSON.stringify({ status }),
        ),
    ]);
    throw redirect(`/admin/iio/${campaign.slug}`);
  }

  if (intent === "review") {
    if (campaign.finalizedAt)
      return { error: "This distribution is finalized and locked." };
    const applicationId = formText(form.get("applicationId"));
    const status = formText(form.get("status"));
    const xFollowers = Number(formText(form.get("xFollowers")));
    const xScore = Number(formText(form.get("xScore")));
    const sorsaScore = Number(formText(form.get("sorsaScore")));
    if (
      !["submitted", "shortlisted", "accepted", "declined"].includes(status) ||
      ![xFollowers, xScore, sorsaScore].every(
        (value) => Number.isFinite(value) && value >= 0,
      )
    )
      return { error: "Review status and score values must be valid." };
    await db
      .prepare(
        `UPDATE campaign_applications
         SET status = ?, x_followers = ?, x_score = ?, sorsa_score = ?,
             updated_at = datetime('now')
         WHERE id = ? AND campaign_id = ?`,
      )
      .bind(
        status,
        Math.round(xFollowers),
        xScore,
        sorsaScore,
        applicationId,
        campaign.id,
      )
      .run();
    return { saved: true };
  }

  if (intent === "finalize") {
    if (campaign.status !== "closed")
      return { error: "Close applications before finalizing distribution." };
    if (campaign.finalizedAt)
      return { error: "This distribution is already finalized." };
    const applicants = await getApplicants(db, campaign.id);
    const selected = applicants.filter((item) => item.status === "accepted");
    if (!selected.length)
      return { error: "Select at least one Creator before finalizing." };
    const distribution = distributeIioBudget(
      selected.map((item) => ({
        id: item.id,
        xFollowers: item.xFollowers,
        xScore: item.xScore,
        sorsaScore: item.sorsaScore,
      })),
      campaign.budgetCents,
      {
        followers: campaign.weightFollowers,
        xScore: campaign.weightXScore,
        sorsaScore: campaign.weightSorsaScore,
      },
    );
    const statements = distribution.flatMap((item) => {
      const applicant = selected.find((candidate) => candidate.id === item.id)!;
      return [
        db
          .prepare(
            `UPDATE campaign_applications
             SET akari_score = ?, payout_percent = ?, payout_cents = ?,
                 updated_at = datetime('now') WHERE id = ?`,
          )
          .bind(item.akariScore, item.payoutPercent, item.payoutCents, item.id),
        db
          .prepare(
            `INSERT INTO notifications
             (id, user_id, kind, title, body, action_url)
             VALUES (?, ?, 'iio.finalized', 'Your IIO allocation is ready', ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            applicant.creatorUserId,
            `Your allocation for ${campaign.title} has been finalized.`,
            `/campaigns/${campaign.slug}`,
          ),
      ];
    });
    statements.push(
      db
        .prepare(
          `UPDATE ambassador_campaigns
           SET finalized_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(campaign.id),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'iio.finalized', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          campaign.id,
          JSON.stringify({
            selectedCreators: distribution.length,
            budgetCents: campaign.budgetCents,
          }),
        ),
    );
    await db.batch(statements);
    throw redirect(`/admin/iio/${campaign.slug}?finalized=1`);
  }

  throw new Response("Unsupported action.", { status: 400 });
}

export default function AdminIioDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { campaign } = loaderData;
  const navigation = useNavigation();
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: campaign.currency,
  });
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main iio-admin">
        <Link className="quiet-link" to="/admin/campaigns">
          Back to campaign control
        </Link>
        <header className="admin-heading">
          <div>
            <span className="eyebrow">IIO · {campaign.status}</span>
            <h1>{campaign.title}</h1>
            <p>{campaign.projectTitle}</p>
          </div>
          <div className="iio-private-budget">
            <small>Private budget</small>
            <strong>{money.format(campaign.budgetCents / 100)}</strong>
            <span>Never shown publicly</span>
          </div>
        </header>
        {actionData?.error && <p className="form-error">{actionData.error}</p>}
        {actionData?.saved && (
          <p className="notice success">Creator review saved.</p>
        )}
        {typeof actionData?.imported === "number" && (
          <p className="notice success">
            Imported {actionData.imported} Creator review
            {actionData.imported === 1 ? "" : "s"} from Google Sheets.
          </p>
        )}
        <section className="iio-command-bar">
          <div>
            <strong>{loaderData.applicants.length}</strong>
            <span>applications</span>
          </div>
          <div>
            <strong>
              {
                loaderData.applicants.filter(
                  (applicant) => applicant.status === "accepted",
                ).length
              }
            </strong>
            <span>selected</span>
          </div>
          <div>
            <strong>
              {campaign.weightFollowers}/{campaign.weightXScore}/
              {campaign.weightSorsaScore}
            </strong>
            <span>followers / XScore / Sorsa</span>
          </div>
          <div className="iio-command-actions">
            <Link
              className="button button-quiet"
              to={`/campaigns/${campaign.slug}/work`}
            >
              Delivery workroom
            </Link>
            {campaign.status === "draft" && (
              <Form method="post">
                <button
                  name="intent"
                  value="publish"
                  className="button button-primary"
                >
                  Publish IIO
                </button>
              </Form>
            )}
            {campaign.status === "published" && (
              <Form method="post">
                <button
                  name="intent"
                  value="close"
                  className="button button-quiet"
                >
                  Close applications
                </button>
              </Form>
            )}
            <a
              className="button button-quiet"
              href={`/admin/iio/${campaign.slug}/export.csv`}
            >
              Download for Google Sheets
            </a>
            {loaderData.googleConnected ? (
              <>
                <Form method="post">
                  <button
                    name="intent"
                    value="google-sheet"
                    className="button button-primary"
                    disabled={navigation.state !== "idle"}
                  >
                    {loaderData.googleSheet
                      ? "Refresh Google Sheet"
                      : "Create Google Sheet"}
                  </button>
                </Form>
                {loaderData.googleSheet && (
                  <>
                    <a
                      className="button button-quiet"
                      href={loaderData.googleSheet.spreadsheetUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Google Sheet
                    </a>
                    {!campaign.finalizedAt && (
                      <Form method="post">
                        <button
                          name="intent"
                          value="google-sheet-import"
                          className="button button-quiet"
                          disabled={navigation.state !== "idle"}
                        >
                          Import Sheet decisions
                        </button>
                      </Form>
                    )}
                  </>
                )}
              </>
            ) : (
              <Link
                className="button button-quiet"
                to="/admin/integrations/google"
              >
                Connect Google Drive
              </Link>
            )}
          </div>
        </section>
        <section className="application-list">
          {loaderData.applicants.map((applicant) => (
            <article
              className="application-card iio-applicant"
              key={applicant.id}
            >
              <div>
                <span className="chapter">{applicant.status}</span>
                <h2>
                  <Link to={`/profiles/${applicant.username}`}>
                    {applicant.creatorName}
                  </Link>
                </h2>
                <div className="iio-social-links">
                  {[
                    ["X", applicant.xUrl],
                    ["TikTok", applicant.tiktokUrl],
                    ["Instagram", applicant.instagramUrl],
                    ["YouTube", applicant.youtubeUrl],
                  ].map(
                    ([label, url]) =>
                      url && (
                        <a
                          key={label}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {label}
                        </a>
                      ),
                  )}
                </div>
                {campaign.finalizedAt && applicant.status === "accepted" && (
                  <p className="iio-payout">
                    {applicant.payoutPercent.toFixed(2)}% ·{" "}
                    <strong>{money.format(applicant.payoutCents / 100)}</strong>
                  </p>
                )}
              </div>
              <Form method="post" className="iio-review-form">
                <input type="hidden" name="intent" value="review" />
                <input
                  type="hidden"
                  name="applicationId"
                  value={applicant.id}
                />
                <label>
                  X followers
                  <input
                    name="xFollowers"
                    type="number"
                    min="0"
                    defaultValue={applicant.xFollowers}
                    disabled={Boolean(campaign.finalizedAt)}
                    required
                  />
                </label>
                <label>
                  XScore
                  <input
                    name="xScore"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={applicant.xScore}
                    disabled={Boolean(campaign.finalizedAt)}
                    required
                  />
                </label>
                <label>
                  Sorsa score
                  <input
                    name="sorsaScore"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={applicant.sorsaScore}
                    disabled={Boolean(campaign.finalizedAt)}
                    required
                  />
                </label>
                <label>
                  Decision
                  <select
                    name="status"
                    defaultValue={applicant.status}
                    disabled={Boolean(campaign.finalizedAt)}
                  >
                    <option value="submitted">Submitted</option>
                    <option value="shortlisted">Shortlisted</option>
                    <option value="accepted">Selected</option>
                    <option value="declined">Declined</option>
                  </select>
                </label>
                {!campaign.finalizedAt && (
                  <button
                    className="button button-primary"
                    disabled={navigation.state !== "idle"}
                  >
                    Save review
                  </button>
                )}
              </Form>
            </article>
          ))}
          {!loaderData.applicants.length && (
            <div className="status-card">
              <h2>No Creator applications yet.</h2>
            </div>
          )}
        </section>
        {campaign.status === "closed" && !campaign.finalizedAt && (
          <section className="iio-finalize-panel">
            <h2>Finalize the distribution</h2>
            <p>
              This locks selected Creators, calculates every allocation, and
              reveals each Creator’s own amount. It cannot be edited afterward.
            </p>
            <Form method="post">
              <button
                name="intent"
                value="finalize"
                className="button button-primary"
              >
                Calculate and finalize
              </button>
            </Form>
          </section>
        )}
      </main>
    </div>
  );
}
