import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin-campaign-compensation";
import { SiteHeader } from "~/components/SiteHeader";
import {
  allocateCampaignBudget,
  campaignPlatforms,
  parseCampaignPlatforms,
  parsePlatformWeights,
  validatePlatformWeights,
  type CampaignPlatform,
  type CampaignPlatformWeights,
} from "~/lib/campaign-compensation";
import { requireCampaignOperator } from "~/lib/campaign-operations.server";
import { parsePostingDays } from "~/lib/campaign-posting-days";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

const platformLabels: Record<CampaignPlatform, string> = {
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

const paymentFrequencyLabels: Record<string, string> = {
  weekly: "per week",
  monthly: "per month",
  one_time: "one time",
  custom: "custom period",
};

type Campaign = {
  id: string;
  slug: string;
  title: string;
  status: string;
  applicationDeadline: string | null;
  startsAt: string | null;
  endsAt: string | null;
  postingCadence: string;
  budgetCents: number;
  currency: string;
  paymentFrequency: string;
  customPaymentLabel: string;
  maximumAllocationCents: number;
  bonusPoolCents: number;
  maximumBonusPerCreatorCents: number;
  dailyEngagementRequired: number;
  engagementActionsJson: string;
  platformWeightsJson: string;
  rosterFinalizedAt: string | null;
};

type Applicant = {
  id: string;
  creatorUserId: string;
  creatorName: string;
  username: string;
  status: string;
  selectedPlatformsJson: string;
  platformCommitmentsJson: string;
  engagementAccepted: number;
  postingDaysJson: string;
  metricsStatus: string;
  metricsVerificationNote: string;
  xUrl: string;
  youtubeUrl: string;
  tiktokUrl: string;
  instagramUrl: string;
  xFollowers: number;
  youtubeFollowers: number;
  tiktokFollowers: number;
  instagramFollowers: number;
  xScore: number;
  sorsaScore: number;
  akariScore: number;
  payoutCents: number;
};

async function getCampaign(db: D1Database, slug: string | undefined) {
  return db
    .prepare(
      `SELECT id, slug, title, status,
              application_deadline AS applicationDeadline,
              starts_at AS startsAt, ends_at AS endsAt,
              posting_cadence AS postingCadence,
              budget_cents AS budgetCents, currency,
              payment_frequency AS paymentFrequency,
              custom_payment_label AS customPaymentLabel,
              maximum_allocation_cents AS maximumAllocationCents,
              bonus_pool_cents AS bonusPoolCents,
              maximum_bonus_per_creator_cents AS maximumBonusPerCreatorCents,
              daily_engagement_required AS dailyEngagementRequired,
              engagement_actions_json AS engagementActionsJson,
              platform_weights_json AS platformWeightsJson,
              roster_finalized_at AS rosterFinalizedAt
       FROM ambassador_campaigns WHERE slug = ?`,
    )
    .bind(slug)
    .first<Campaign>();
}

async function getApplicants(db: D1Database, campaignId: string) {
  return (
    await db
      .prepare(
        `SELECT ca.id, ca.creator_user_id AS creatorUserId,
                COALESCE(NULLIF(ca.creator_name, ''), p.display_name) AS creatorName,
                u.username, ca.status,
                ca.selected_platforms_json AS selectedPlatformsJson,
                ca.platform_commitments_json AS platformCommitmentsJson,
                ca.engagement_accepted AS engagementAccepted,
                ca.posting_days_json AS postingDaysJson,
                ca.metrics_status AS metricsStatus,
                ca.metrics_verification_note AS metricsVerificationNote,
                ca.x_url AS xUrl, ca.youtube_url AS youtubeUrl,
                ca.tiktok_url AS tiktokUrl, ca.instagram_url AS instagramUrl,
                ca.x_followers AS xFollowers,
                ca.youtube_followers AS youtubeFollowers,
                ca.tiktok_followers AS tiktokFollowers,
                ca.instagram_followers AS instagramFollowers,
                ca.x_score AS xScore, ca.sorsa_score AS sorsaScore,
                ca.akari_score AS akariScore, ca.payout_cents AS payoutCents
         FROM campaign_applications ca
         JOIN users u ON u.id = ca.creator_user_id
         JOIN profiles p ON p.user_id = ca.creator_user_id
         WHERE ca.campaign_id = ? AND ca.status <> 'withdrawn'
         ORDER BY ca.created_at`,
      )
      .bind(campaignId)
      .all<Applicant>()
  ).results;
}

function campaignClosedForApplications(campaign: Campaign) {
  if (!campaign.applicationDeadline) return false;
  return (
    new Date().toISOString().slice(0, 10) >
    campaign.applicationDeadline.slice(0, 10)
  );
}

function numberField(form: FormData, name: string) {
  return Number(formText(form.get(name)));
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const campaign = await getCampaign(db, params.slug);
  if (!campaign) throw new Response("Campaign not found.", { status: 404 });
  const user = await requireCampaignOperator(request, db, campaign.id);
  const applicants = await getApplicants(db, campaign.id);
  const bonuses = await db
    .prepare(
      `SELECT application_id AS applicationId,
              COALESCE(SUM(CASE WHEN status IN ('approved','paid')
                THEN amount_cents ELSE 0 END), 0) AS bonusCents
       FROM campaign_creator_bonuses WHERE campaign_id = ?
       GROUP BY application_id`,
    )
    .bind(campaign.id)
    .all<{ applicationId: string; bonusCents: number }>();
  return {
    user,
    campaign,
    applicants,
    bonuses: bonuses.results,
    registrationClosed: campaignClosedForApplications(campaign),
    saved: new URL(request.url).searchParams.has("saved"),
    finalized: new URL(request.url).searchParams.has("finalized"),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const campaign = await getCampaign(db, params.slug);
  if (!campaign) throw new Response("Campaign not found.", { status: 404 });
  const operator = await requireCampaignOperator(request, db, campaign.id);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "configure") {
    if (campaign.rosterFinalizedAt)
      return { error: "Finalized roster compensation cannot be reconfigured." };
    const budget = numberField(form, "budget");
    const maximumAllocation = numberField(form, "maximumAllocation");
    const bonusPool = numberField(form, "bonusPool");
    const maximumBonus = numberField(form, "maximumBonus");
    const paymentFrequency = formText(form.get("paymentFrequency"));
    const customPaymentLabel = formText(form.get("customPaymentLabel")).trim();
    const dailyEngagementRequired =
      form.get("dailyEngagementRequired") === "yes";
    const engagementActions = ["Comment", "Like", "Repost", "Bookmark"].filter(
      (action) => form.get(`engagement_${action.toLowerCase()}`) === "yes",
    );
    const platformWeights = Object.fromEntries(
      campaignPlatforms.map((platform) => [
        platform,
        numberField(form, `weight_${platform}`),
      ]),
    ) as CampaignPlatformWeights;
    const budgetCents = Math.round(budget * 100);
    const maximumAllocationCents = Math.round(maximumAllocation * 100);
    const bonusPoolCents = Math.round(bonusPool * 100);
    const maximumBonusCents = Math.round(maximumBonus * 100);
    const baseBudgetCents = budgetCents - bonusPoolCents;
    if (
      ![budget, maximumAllocation, bonusPool, maximumBonus].every(
        (value) => Number.isFinite(value) && value >= 0,
      ) ||
      budgetCents <= 0 ||
      bonusPoolCents > budgetCents ||
      maximumAllocationCents <= 0 ||
      maximumAllocationCents > baseBudgetCents ||
      maximumBonusCents > bonusPoolCents ||
      !["weekly", "monthly", "one_time", "custom"].includes(paymentFrequency) ||
      (paymentFrequency === "custom" && customPaymentLabel.length < 3) ||
      !validatePlatformWeights(platformWeights) ||
      (dailyEngagementRequired && !engagementActions.length)
    )
      return {
        error:
          "Check the total budget, reserved bonus pool, maximum individual amounts, payment period and platform weights. Platform weights must total 100.",
      };
    await db.batch([
      db
        .prepare(
          `UPDATE ambassador_campaigns
           SET budget_cents = ?, maximum_allocation_cents = ?,
               bonus_pool_cents = ?, maximum_bonus_per_creator_cents = ?,
               payment_frequency = ?, custom_payment_label = ?,
               daily_engagement_required = ?, engagement_actions_json = ?,
               platform_weights_json = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(
          budgetCents,
          maximumAllocationCents,
          bonusPoolCents,
          maximumBonusCents,
          paymentFrequency,
          customPaymentLabel,
          dailyEngagementRequired ? 1 : 0,
          JSON.stringify(engagementActions),
          JSON.stringify(platformWeights),
          campaign.id,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.compensation_configured', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          operator.id,
          campaign.id,
          JSON.stringify({
            budgetCents,
            maximumAllocationCents,
            bonusPoolCents,
            maximumBonusCents,
            paymentFrequency,
            platformWeights,
          }),
        ),
    ]);
    throw redirect(`/admin/campaign-compensation/${campaign.slug}?saved=1`);
  }

  if (intent === "verify-metrics") {
    if (!campaignClosedForApplications(campaign))
      return { error: "Creator metrics unlock after registration closes." };
    if (campaign.rosterFinalizedAt)
      return { error: "Metrics are locked after roster finalization." };
    const applicationId = formText(form.get("applicationId"));
    const note = formText(form.get("verificationNote")).trim();
    const application = (await getApplicants(db, campaign.id)).find(
      (item) => item.id === applicationId,
    );
    if (!application) return { error: "Creator application not found." };
    const selectedPlatforms = parseCampaignPlatforms(
      application.selectedPlatformsJson,
    );
    const followers: Record<CampaignPlatform, number> = {
      x: numberField(form, "xFollowers"),
      youtube: numberField(form, "youtubeFollowers"),
      tiktok: numberField(form, "tiktokFollowers"),
      instagram: numberField(form, "instagramFollowers"),
    };
    const xScore = numberField(form, "xScore");
    const sorsaScore = numberField(form, "sorsaScore");
    if (
      note.length < 5 ||
      note.length > 500 ||
      selectedPlatforms.some(
        (platform) =>
          !Number.isFinite(followers[platform]) || followers[platform] < 0,
      ) ||
      (selectedPlatforms.includes("x") &&
        (![xScore, sorsaScore].every(Number.isFinite) ||
          xScore < 0 ||
          sorsaScore < 0))
    )
      return {
        error: "Enter verified non-negative metrics and a review note.",
      };
    const urls: Record<CampaignPlatform, string> = {
      x: application.xUrl,
      youtube: application.youtubeUrl,
      tiktok: application.tiktokUrl,
      instagram: application.instagramUrl,
    };
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `UPDATE campaign_applications
           SET x_followers = ?, youtube_followers = ?, tiktok_followers = ?,
               instagram_followers = ?, x_score = ?, sorsa_score = ?,
               metrics_status = 'verified', metrics_verified_by = ?,
               metrics_verified_at = datetime('now'),
               metrics_verification_note = ?, updated_at = datetime('now')
           WHERE id = ? AND campaign_id = ?`,
        )
        .bind(
          Math.round(followers.x),
          Math.round(followers.youtube),
          Math.round(followers.tiktok),
          Math.round(followers.instagram),
          selectedPlatforms.includes("x") ? xScore : application.xScore,
          selectedPlatforms.includes("x") ? sorsaScore : application.sorsaScore,
          operator.id,
          note,
          application.id,
          campaign.id,
        ),
    ];
    for (const platform of selectedPlatforms) {
      if (!urls[platform])
        return {
          error: `${platformLabels[platform]} is selected but has no campaign profile URL.`,
        };
      statements.push(
        db
          .prepare(
            `INSERT INTO profile_social_accounts
             (user_id, platform, profile_url, follower_count, count_source,
              sync_status, last_reported_at, updated_at)
             VALUES (?, ?, ?, ?, 'verified_snapshot', 'manual',
                     datetime('now'), datetime('now'))
             ON CONFLICT(user_id, platform) DO UPDATE SET
               profile_url = excluded.profile_url,
               follower_count = excluded.follower_count,
               count_source = 'verified_snapshot', sync_status = 'manual',
               last_reported_at = datetime('now'), updated_at = datetime('now')`,
          )
          .bind(
            application.creatorUserId,
            platform,
            urls[platform],
            Math.round(followers[platform]),
          ),
        db
          .prepare(
            `INSERT INTO social_metric_snapshots
             (id, user_id, platform, follower_count, source)
             VALUES (?, ?, ?, ?, 'verified_snapshot')`,
          )
          .bind(
            crypto.randomUUID(),
            application.creatorUserId,
            platform,
            Math.round(followers[platform]),
          ),
      );
    }
    if (selectedPlatforms.includes("x"))
      statements.push(
        db
          .prepare(
            `INSERT INTO profile_reputation_signals
             (user_id, sorsa_score, sorsa_source, x_score, x_score_source,
              updated_at)
             VALUES (?, ?, 'partner_verified', ?, 'partner_verified', datetime('now'))
             ON CONFLICT(user_id) DO UPDATE SET
               sorsa_score = excluded.sorsa_score,
               sorsa_source = 'partner_verified',
               x_score = excluded.x_score,
               x_score_source = 'partner_verified',
               updated_at = datetime('now')`,
          )
          .bind(application.creatorUserId, sorsaScore, xScore),
      );
    statements.push(
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.metrics_verified', 'campaign_application', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          operator.id,
          application.id,
          JSON.stringify({ selectedPlatforms, followers, xScore, sorsaScore }),
        ),
    );
    await db.batch(statements);
    throw redirect(`/admin/campaign-compensation/${campaign.slug}?saved=1`);
  }

  if (intent === "finalize-roster") {
    if (!campaignClosedForApplications(campaign))
      return { error: "Close registration before finalizing participants." };
    if (campaign.rosterFinalizedAt)
      return { error: "This campaign roster is already finalized." };
    const selectedIds = new Set(
      form
        .getAll("selectedApplicationIds")
        .map((value) => formText(value))
        .filter(Boolean),
    );
    if (!selectedIds.size)
      return { error: "Select at least one verified Creator." };
    const applicants = await getApplicants(db, campaign.id);
    const selected = applicants.filter((item) => selectedIds.has(item.id));
    if (
      selected.length !== selectedIds.size ||
      selected.some((item) => item.metricsStatus !== "verified")
    )
      return { error: "Every selected Creator must have verified metrics." };
    if (
      campaign.budgetCents <= 0 ||
      campaign.maximumAllocationCents <= 0 ||
      campaign.bonusPoolCents > campaign.budgetCents
    )
      return { error: "Configure the campaign budget before finalizing." };
    const platformWeights = parsePlatformWeights(campaign.platformWeightsJson);
    const allocations = allocateCampaignBudget(
      selected.map((item) => ({
        id: item.id,
        selectedPlatforms: parseCampaignPlatforms(item.selectedPlatformsJson),
        followers: {
          x: item.xFollowers,
          youtube: item.youtubeFollowers,
          tiktok: item.tiktokFollowers,
          instagram: item.instagramFollowers,
        },
        xScore: item.xScore,
        sorsaScore: item.sorsaScore,
        postingDays: parsePostingDays(item.postingDaysJson),
        engagementAccepted: item.engagementAccepted === 1,
      })),
      {
        budgetCents: campaign.budgetCents,
        bonusPoolCents: campaign.bonusPoolCents,
        maximumAllocationCents: campaign.maximumAllocationCents,
        platformWeights,
        postingCadence: campaign.postingCadence,
        dailyEngagementRequired: campaign.dailyEngagementRequired === 1,
      },
    );
    const allocationMap = new Map(
      allocations.map((allocation) => [allocation.id, allocation]),
    );
    const paymentLabel =
      campaign.paymentFrequency === "custom"
        ? campaign.customPaymentLabel
        : (paymentFrequencyLabels[campaign.paymentFrequency] ?? "per campaign");
    const statements: D1PreparedStatement[] = [];
    for (const applicant of applicants) {
      const allocation = allocationMap.get(applicant.id);
      if (allocation) {
        let commitments = "the campaign deliverables";
        try {
          const parsed = JSON.parse(
            applicant.platformCommitmentsJson,
          ) as Record<string, string>;
          const values = Object.values(parsed).filter(Boolean);
          if (values.length) commitments = values.join(" · ").slice(0, 700);
        } catch {
          commitments = "the campaign deliverables";
        }
        const expected = `${campaign.currency} ${(allocation.payoutCents / 100).toFixed(2)} ${paymentLabel}`;
        statements.push(
          db
            .prepare(
              `UPDATE campaign_applications
               SET status = 'accepted', accepted_at = datetime('now'),
                   declined_at = NULL, akari_score = ?, payout_percent = ?,
                   payout_cents = ?, updated_at = datetime('now')
               WHERE id = ?`,
            )
            .bind(
              allocation.selectionScore,
              allocation.payoutPercent,
              allocation.payoutCents,
              applicant.id,
            ),
          db
            .prepare(
              `INSERT INTO notifications
               (id, user_id, kind, title, body, action_url)
               VALUES (?, ?, 'campaign.accepted', 'You were accepted into a campaign', ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              applicant.creatorUserId,
              `You were accepted into ${campaign.title}. Your work: ${commitments}. Expected payment: ${expected}.`,
              `/campaigns/${campaign.slug}/performance`,
            ),
        );
      } else {
        statements.push(
          db
            .prepare(
              `UPDATE campaign_applications
               SET status = 'declined', declined_at = datetime('now'),
                   accepted_at = NULL, payout_cents = 0, payout_percent = 0,
                   updated_at = datetime('now') WHERE id = ?`,
            )
            .bind(applicant.id),
          db
            .prepare(
              `INSERT INTO notifications
               (id, user_id, kind, title, body, action_url)
               VALUES (?, ?, 'campaign.declined', 'Campaign application update', ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              applicant.creatorUserId,
              `Your application to ${campaign.title} was not selected for this campaign.`,
              `/campaigns/${campaign.slug}`,
            ),
        );
      }
    }
    statements.push(
      db
        .prepare(
          `UPDATE ambassador_campaigns
           SET roster_finalized_at = datetime('now'), roster_finalized_by = ?,
               finalized_at = COALESCE(finalized_at, datetime('now')),
               updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(operator.id, campaign.id),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.roster_finalized', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          operator.id,
          campaign.id,
          JSON.stringify({
            acceptedApplicationIds: [...selectedIds],
            totalAllocatedCents: allocations.reduce(
              (sum, item) => sum + item.payoutCents,
              0,
            ),
          }),
        ),
    );
    await db.batch(statements);
    throw redirect(`/admin/campaign-compensation/${campaign.slug}?finalized=1`);
  }

  throw new Response("Unsupported campaign compensation action.", {
    status: 400,
  });
}

export default function AdminCampaignCompensation({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const { campaign } = loaderData;
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: campaign.currency,
  });
  const weights = parsePlatformWeights(campaign.platformWeightsJson);
  let actions: string[] = [];
  try {
    const parsed: unknown = JSON.parse(campaign.engagementActionsJson);
    if (Array.isArray(parsed))
      actions = parsed.filter(
        (item): item is string => typeof item === "string",
      );
  } catch {
    actions = [];
  }
  const bonusMap = new Map(
    loaderData.bonuses.map((bonus) => [bonus.applicationId, bonus.bonusCents]),
  );
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <Link className="quiet-link" to="/admin/campaign-compensation">
          Back to compensation campaigns
        </Link>
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Creator compensation</span>
            <h1>{campaign.title}</h1>
            <p>
              Verify campaign metrics, finalize a budget-safe roster, track
              performance and generate the project report.
            </p>
          </div>
          <div className="button-row">
            <Link
              className="button button-quiet"
              to={`/campaigns/${campaign.slug}/performance`}
            >
              Performance workroom
            </Link>
            <Link
              className="button button-primary"
              to={`/admin/campaign-compensation/${campaign.slug}/report.xls`}
            >
              Download internal spreadsheet
            </Link>
          </div>
        </header>
        {loaderData.saved && (
          <p className="notice success">Campaign compensation updated.</p>
        )}
        {loaderData.finalized && (
          <p className="notice success">
            Creator roster, jobs and expected payments were finalized and
            notifications were sent.
          </p>
        )}
        {actionData?.error && <p className="form-error">{actionData.error}</p>}
        <section className="admin-panel">
          <span className="chapter">Private campaign economics</span>
          <h2>Budget, ceiling, bonus pool and scoring.</h2>
          <Form method="post" className="profile-form">
            <input type="hidden" name="intent" value="configure" />
            <div className="form-row form-row-three">
              <label>
                Total campaign budget ({campaign.currency})
                <input
                  name="budget"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={campaign.budgetCents / 100}
                  required
                />
              </label>
              <label>
                Maximum base allocation per Creator
                <input
                  name="maximumAllocation"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={campaign.maximumAllocationCents / 100}
                  required
                />
              </label>
              <label>
                Reserved performance bonus pool
                <input
                  name="bonusPool"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={campaign.bonusPoolCents / 100}
                  required
                />
              </label>
            </div>
            <div className="form-row form-row-three">
              <label>
                Maximum bonus per Creator
                <input
                  name="maximumBonus"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={campaign.maximumBonusPerCreatorCents / 100}
                  required
                />
              </label>
              <label>
                Payment frequency
                <select
                  name="paymentFrequency"
                  defaultValue={campaign.paymentFrequency}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="one_time">One-time campaign payment</option>
                  <option value="custom">Custom / negotiated</option>
                </select>
              </label>
              <label>
                Custom payment period label
                <input
                  name="customPaymentLabel"
                  maxLength={100}
                  defaultValue={campaign.customPaymentLabel}
                  placeholder="Example: per negotiated milestone"
                />
              </label>
            </div>
            <fieldset>
              <legend>Campaign platform importance: total 100</legend>
              <div className="form-row form-row-three">
                {campaignPlatforms.map((platform) => (
                  <label key={platform}>
                    {platformLabels[platform]} %
                    <input
                      name={`weight_${platform}`}
                      type="number"
                      min="0"
                      max="100"
                      defaultValue={weights[platform]}
                      required
                    />
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Daily engagement</legend>
              <label className="inline-choice">
                <input
                  type="checkbox"
                  name="dailyEngagementRequired"
                  value="yes"
                  defaultChecked={campaign.dailyEngagementRequired === 1}
                />
                Daily engagement is required separately from posting cadence
              </label>
              <div className="interest-grid">
                {["Comment", "Like", "Repost", "Bookmark"].map((action) => (
                  <label key={action}>
                    <input
                      type="checkbox"
                      name={`engagement_${action.toLowerCase()}`}
                      value="yes"
                      defaultChecked={actions.includes(action)}
                    />
                    <span>{action}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              className="button button-primary"
              disabled={
                navigation.state !== "idle" ||
                Boolean(campaign.rosterFinalizedAt)
              }
            >
              Save compensation rules
            </button>
          </Form>
          <p>
            Base allocation pool:{" "}
            {money.format(
              Math.max(0, campaign.budgetCents - campaign.bonusPoolCents) / 100,
            )}
            . The system scales allocations before saving, so the campaign can
            never exceed this amount.
          </p>
        </section>
        {!loaderData.registrationClosed && (
          <p className="notice">
            Creator details remain count-only until registration closes on{" "}
            {campaign.applicationDeadline ?? "the configured deadline"}.
          </p>
        )}
        {loaderData.registrationClosed && (
          <section className="application-list">
            <header>
              <span className="eyebrow">Metric verification</span>
              <h2>Cross-check every Creator before selection.</h2>
            </header>
            {loaderData.applicants.map((applicant) => {
              const selected = parseCampaignPlatforms(
                applicant.selectedPlatformsJson,
              );
              return (
                <article className="application-card" key={applicant.id}>
                  <div>
                    <span className="chapter">
                      {applicant.metricsStatus} · {applicant.status}
                    </span>
                    <h3>
                      <Link to={`/profiles/${applicant.username}`}>
                        {applicant.creatorName}
                      </Link>
                    </h3>
                    <p>
                      Channels:{" "}
                      {selected
                        .map((platform) => platformLabels[platform])
                        .join(", ")}
                    </p>
                    {applicant.status === "accepted" && (
                      <p>
                        Private allocation:{" "}
                        {money.format(applicant.payoutCents / 100)} · bonuses:{" "}
                        {money.format((bonusMap.get(applicant.id) ?? 0) / 100)}
                      </p>
                    )}
                  </div>
                  {!campaign.rosterFinalizedAt && (
                    <Form method="post" className="profile-form">
                      <input
                        type="hidden"
                        name="intent"
                        value="verify-metrics"
                      />
                      <input
                        type="hidden"
                        name="applicationId"
                        value={applicant.id}
                      />
                      <div className="form-row form-row-three">
                        <label>
                          X followers
                          <input
                            name="xFollowers"
                            type="number"
                            min="0"
                            defaultValue={applicant.xFollowers}
                            required
                          />
                        </label>
                        <label>
                          YouTube subscribers
                          <input
                            name="youtubeFollowers"
                            type="number"
                            min="0"
                            defaultValue={applicant.youtubeFollowers}
                            required
                          />
                        </label>
                        <label>
                          TikTok followers
                          <input
                            name="tiktokFollowers"
                            type="number"
                            min="0"
                            defaultValue={applicant.tiktokFollowers}
                            required
                          />
                        </label>
                        <label>
                          Instagram followers
                          <input
                            name="instagramFollowers"
                            type="number"
                            min="0"
                            defaultValue={applicant.instagramFollowers}
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
                            required
                          />
                        </label>
                      </div>
                      <label>
                        Verification note
                        <input
                          name="verificationNote"
                          minLength={5}
                          maxLength={500}
                          defaultValue={applicant.metricsVerificationNote}
                          required
                        />
                      </label>
                      <button className="button button-quiet">
                        Verify metrics and update AKARI profile
                      </button>
                    </Form>
                  )}
                </article>
              );
            })}
          </section>
        )}
        {loaderData.registrationClosed && !campaign.rosterFinalizedAt && (
          <section className="admin-panel">
            <span className="chapter">Final selection</span>
            <h2>Choose the accepted roster once.</h2>
            <p>
              The highest verified performance can reach the configured maximum.
              Lower-ranked Creators receive less, and the full roster is scaled
              before saving so it never exceeds the base allocation pool.
            </p>
            <Form method="post" className="profile-form">
              <input type="hidden" name="intent" value="finalize-roster" />
              <div className="interest-grid">
                {loaderData.applicants
                  .filter((applicant) => applicant.metricsStatus === "verified")
                  .map((applicant) => (
                    <label key={applicant.id}>
                      <input
                        type="checkbox"
                        name="selectedApplicationIds"
                        value={applicant.id}
                      />
                      <span>
                        <strong>{applicant.creatorName}</strong>
                        <small>
                          {parseCampaignPlatforms(
                            applicant.selectedPlatformsJson,
                          )
                            .map((platform) => platformLabels[platform])
                            .join(", ")}
                        </small>
                      </span>
                    </label>
                  ))}
              </div>
              <button
                className="button button-primary"
                disabled={navigation.state !== "idle"}
              >
                Finalize participants, jobs and payments
              </button>
            </Form>
          </section>
        )}
        {campaign.rosterFinalizedAt && (
          <section className="admin-panel">
            <span className="chapter">Reporting</span>
            <h2>Roster finalized {campaign.rosterFinalizedAt}.</h2>
            <div className="button-row">
              <Link
                className="button button-primary"
                to={`/campaigns/${campaign.slug}/performance`}
              >
                Track content, metrics and bonuses
              </Link>
              <Link
                className="button button-quiet"
                to={`/admin/campaign-compensation/${campaign.slug}/report.xls`}
              >
                Internal spreadsheet
              </Link>
              <Link
                className="button button-quiet"
                to={`/admin/campaign-compensation/${campaign.slug}/report.xls?view=project`}
              >
                Project-facing spreadsheet
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
