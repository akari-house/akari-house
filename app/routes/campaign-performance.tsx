import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/campaign-performance";
import { SiteHeader } from "~/components/SiteHeader";
import {
  campaignPlatforms,
  parseCampaignPlatforms,
  type CampaignPlatform,
} from "~/lib/campaign-compensation";
import { parseJsonObject } from "~/lib/campaign-json";
import { canOperateCampaign } from "~/lib/campaign-operations.server";
import { parsePostingDays, postingDays } from "~/lib/campaign-posting-days";
import { requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

const platformLabels: Record<CampaignPlatform, string> = {
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

const bonusTypes = [
  "Outstanding engagement",
  "Exceptional reach",
  "Content quality",
  "Consistent delivery",
  "Early delivery",
  "Community contribution",
  "Custom",
] as const;

type Campaign = {
  id: string;
  slug: string;
  title: string;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  paymentFrequency: string;
  customPaymentLabel: string;
  bonusPoolCents: number;
  maximumBonusPerCreatorCents: number;
  rosterFinalizedAt: string | null;
};

type Participant = {
  applicationId: string;
  creatorUserId: string;
  displayName: string;
  username: string;
  selectedPlatformsJson: string;
  platformCommitmentsJson: string;
  postingDaysJson: string;
  payoutCents: number;
};

type ContentItem = {
  id: string;
  applicationId: string;
  creatorUserId: string;
  creatorName: string;
  platform: CampaignPlatform;
  workUrl: string;
  publishedAt: string;
  status: string;
  reviewNote: string;
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  bookmarks: number;
  clicks: number;
  metricSource: string | null;
  metricCapturedAt: string | null;
};

async function getCampaign(db: D1Database, slug: string | undefined) {
  return db
    .prepare(
      `SELECT id, slug, title, currency, starts_at AS startsAt,
              ends_at AS endsAt, payment_frequency AS paymentFrequency,
              custom_payment_label AS customPaymentLabel,
              bonus_pool_cents AS bonusPoolCents,
              maximum_bonus_per_creator_cents AS maximumBonusPerCreatorCents,
              roster_finalized_at AS rosterFinalizedAt
       FROM ambassador_campaigns WHERE slug = ?`,
    )
    .bind(slug)
    .first<Campaign>();
}

async function getParticipants(db: D1Database, campaignId: string) {
  return (
    await db
      .prepare(
        `SELECT ca.id AS applicationId, ca.creator_user_id AS creatorUserId,
                p.display_name AS displayName, u.username,
                ca.selected_platforms_json AS selectedPlatformsJson,
                ca.platform_commitments_json AS platformCommitmentsJson,
                ca.posting_days_json AS postingDaysJson,
                ca.payout_cents AS payoutCents
         FROM campaign_applications ca
         JOIN profiles p ON p.user_id = ca.creator_user_id
         JOIN users u ON u.id = ca.creator_user_id
         WHERE ca.campaign_id = ? AND ca.status = 'accepted'
         ORDER BY p.display_name`,
      )
      .bind(campaignId)
      .all<Participant>()
  ).results;
}

async function getContent(db: D1Database, campaignId: string) {
  return (
    await db
      .prepare(
        `SELECT ci.id, ci.application_id AS applicationId,
                ci.creator_user_id AS creatorUserId,
                p.display_name AS creatorName, ci.platform,
                ci.work_url AS workUrl, ci.published_at AS publishedAt,
                ci.status, ci.review_note AS reviewNote,
                COALESCE(ms.views, 0) AS views,
                COALESCE(ms.likes, 0) AS likes,
                COALESCE(ms.comments, 0) AS comments,
                COALESCE(ms.reposts, 0) AS reposts,
                COALESCE(ms.bookmarks, 0) AS bookmarks,
                COALESCE(ms.clicks, 0) AS clicks,
                ms.source AS metricSource,
                ms.captured_at AS metricCapturedAt
         FROM campaign_content_items ci
         JOIN profiles p ON p.user_id = ci.creator_user_id
         LEFT JOIN campaign_content_metric_snapshots ms
           ON ms.id = (
             SELECT latest.id FROM campaign_content_metric_snapshots latest
             WHERE latest.content_item_id = ci.id
             ORDER BY latest.is_final DESC, latest.captured_at DESC LIMIT 1
           )
         WHERE ci.campaign_id = ?
         ORDER BY ci.published_at DESC, ci.created_at DESC`,
      )
      .bind(campaignId)
      .all<ContentItem>()
  ).results;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const campaign = await getCampaign(db, params.slug);
  if (!campaign) throw new Response("Campaign not found.", { status: 404 });
  const participants = await getParticipants(db, campaign.id);
  const ownApplication = participants.find(
    (participant) => participant.creatorUserId === user.id,
  );
  const operator = await canOperateCampaign(db, user.id, campaign.id);
  if (!operator && !ownApplication)
    throw new Response("Accepted Creators only.", { status: 403 });
  const [content, bonuses] = await Promise.all([
    getContent(db, campaign.id),
    db
      .prepare(
        `SELECT id, application_id AS applicationId,
                creator_user_id AS creatorUserId, amount_cents AS amountCents,
                bonus_type AS bonusType, reason, evidence_url AS evidenceUrl,
                period_label AS periodLabel, status, approved_at AS approvedAt
         FROM campaign_creator_bonuses
         WHERE campaign_id = ? AND status <> 'cancelled'
         ORDER BY created_at DESC`,
      )
      .bind(campaign.id)
      .all<{
        id: string;
        applicationId: string;
        creatorUserId: string;
        amountCents: number;
        bonusType: string;
        reason: string;
        evidenceUrl: string;
        periodLabel: string;
        status: string;
        approvedAt: string | null;
      }>(),
  ]);
  return {
    user,
    campaign,
    operator,
    participants,
    ownApplication,
    content: operator
      ? content
      : content.filter((item) => item.creatorUserId === user.id),
    bonuses: operator
      ? bonuses.results
      : bonuses.results.filter((bonus) => bonus.creatorUserId === user.id),
    saved: new URL(request.url).searchParams.has("saved"),
  };
}

function numberField(form: FormData, name: string) {
  return Number(formText(form.get(name)));
}

function safePublicUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const campaign = await getCampaign(db, params.slug);
  if (!campaign) throw new Response("Campaign not found.", { status: 404 });
  const participants = await getParticipants(db, campaign.id);
  const ownApplication = participants.find(
    (participant) => participant.creatorUserId === user.id,
  );
  const operator = await canOperateCampaign(db, user.id, campaign.id);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "submit-content") {
    if (!ownApplication)
      throw new Response("Accepted Creator required.", { status: 403 });
    const platform = formText(form.get("platform")) as CampaignPlatform;
    const selected = parseCampaignPlatforms(
      ownApplication.selectedPlatformsJson,
    );
    const workUrl = safePublicUrl(formText(form.get("workUrl")).trim());
    const publishedAt = formText(form.get("publishedAt")).trim();
    if (
      !campaignPlatforms.includes(platform) ||
      !selected.includes(platform) ||
      !workUrl ||
      !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)
    )
      return {
        error: "Choose a committed channel, date and valid public URL.",
      };
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO campaign_content_items
             (id, campaign_id, application_id, creator_user_id, platform,
              work_url, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            campaign.id,
            ownApplication.applicationId,
            user.id,
            platform,
            workUrl,
            publishedAt,
          ),
        db
          .prepare(
            `INSERT INTO audit_logs
             (id, actor_user_id, action, subject_type, subject_id, metadata_json)
             VALUES (?, ?, 'campaign.content_submitted', 'campaign', ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            user.id,
            campaign.id,
            JSON.stringify({ platform, workUrl }),
          ),
      ]);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("unique constraint")
      )
        return { error: "This campaign URL has already been submitted." };
      throw error;
    }
    throw redirect(`/campaigns/${campaign.slug}/performance?saved=1`);
  }

  if (!operator)
    throw new Response("Campaign moderation required.", { status: 403 });

  if (intent === "review-content") {
    const contentId = formText(form.get("contentId"));
    const status = formText(form.get("status"));
    const note = formText(form.get("reviewNote")).trim();
    if (
      !["approved", "rejected"].includes(status) ||
      (status === "rejected" && note.length < 5) ||
      note.length > 500
    )
      return { error: "Approve the content or explain a rejection." };
    await db
      .prepare(
        `UPDATE campaign_content_items
         SET status = ?, review_note = ?, reviewed_by = ?,
             reviewed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND campaign_id = ?`,
      )
      .bind(status, note, user.id, contentId, campaign.id)
      .run();
    throw redirect(`/campaigns/${campaign.slug}/performance?saved=1`);
  }

  if (intent === "record-metrics") {
    if (
      !campaign.endsAt ||
      new Date().toISOString().slice(0, 10) < campaign.endsAt.slice(0, 10)
    )
      return { error: "Final manual metrics unlock when the campaign ends." };
    const contentId = formText(form.get("contentId"));
    const content = (await getContent(db, campaign.id)).find(
      (item) => item.id === contentId,
    );
    if (!content) return { error: "Submitted content not found." };
    const metrics = {
      views: numberField(form, "views"),
      likes: numberField(form, "likes"),
      comments: numberField(form, "comments"),
      reposts: numberField(form, "reposts"),
      bookmarks: numberField(form, "bookmarks"),
      clicks: numberField(form, "clicks"),
    };
    const note = formText(form.get("verificationNote")).trim();
    if (
      !Object.values(metrics).every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ) ||
      note.length < 5 ||
      note.length > 500
    )
      return { error: "Enter non-negative whole-number metrics and a note." };
    await db.batch([
      db
        .prepare(
          `UPDATE campaign_content_metric_snapshots SET is_final = 0
           WHERE content_item_id = ? AND is_final = 1`,
        )
        .bind(content.id),
      db
        .prepare(
          `INSERT INTO campaign_content_metric_snapshots
           (id, content_item_id, campaign_id, application_id, creator_user_id,
            platform, views, likes, comments, reposts, bookmarks, clicks,
            source, verification_note, is_final, captured_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, 1, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          content.id,
          campaign.id,
          content.applicationId,
          content.creatorUserId,
          content.platform,
          metrics.views,
          metrics.likes,
          metrics.comments,
          metrics.reposts,
          metrics.bookmarks,
          metrics.clicks,
          note,
          user.id,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.metrics_recorded', 'campaign_content', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          content.id,
          JSON.stringify(metrics),
        ),
    ]);
    throw redirect(`/campaigns/${campaign.slug}/performance?saved=1`);
  }

  if (intent === "award-bonus") {
    const applicationId = formText(form.get("applicationId"));
    const participant = participants.find(
      (item) => item.applicationId === applicationId,
    );
    if (!participant) return { error: "Accepted Creator not found." };
    const amount = numberField(form, "amount");
    const amountCents = Math.round(amount * 100);
    const bonusType = formText(form.get("bonusType")).trim();
    const reason = formText(form.get("reason")).trim();
    const periodLabel = formText(form.get("periodLabel")).trim();
    const evidenceValue = formText(form.get("evidenceUrl")).trim();
    const evidenceUrl = evidenceValue ? safePublicUrl(evidenceValue) : "";
    if (
      !Number.isFinite(amount) ||
      amountCents <= 0 ||
      !bonusTypes.includes(bonusType as (typeof bonusTypes)[number]) ||
      reason.length < 10 ||
      reason.length > 500 ||
      periodLabel.length > 100 ||
      (evidenceValue && !evidenceUrl)
    )
      return { error: "Complete the bonus amount, type, reason and evidence." };
    const totals = await db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status IN ('approved','paid')
             THEN amount_cents ELSE 0 END), 0) AS campaignBonusCents,
           COALESCE(SUM(CASE WHEN application_id = ?
             AND status IN ('approved','paid') THEN amount_cents ELSE 0 END), 0)
             AS creatorBonusCents
         FROM campaign_creator_bonuses WHERE campaign_id = ?`,
      )
      .bind(applicationId, campaign.id)
      .first<{ campaignBonusCents: number; creatorBonusCents: number }>();
    const campaignBonusCents = totals?.campaignBonusCents ?? 0;
    const creatorBonusCents = totals?.creatorBonusCents ?? 0;
    if (
      campaignBonusCents + amountCents > campaign.bonusPoolCents ||
      creatorBonusCents + amountCents > campaign.maximumBonusPerCreatorCents
    )
      return {
        error:
          "This bonus would exceed the remaining campaign pool or the Creator bonus ceiling.",
      };
    await db.batch([
      db
        .prepare(
          `INSERT INTO campaign_creator_bonuses
           (id, campaign_id, application_id, creator_user_id, amount_cents,
            bonus_type, reason, evidence_url, period_label, status,
            proposed_by, approved_by, approved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, datetime('now'))`,
        )
        .bind(
          crypto.randomUUID(),
          campaign.id,
          participant.applicationId,
          participant.creatorUserId,
          amountCents,
          bonusType,
          reason,
          evidenceUrl,
          periodLabel,
          user.id,
          user.id,
        ),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'campaign.bonus_awarded', 'You received a campaign bonus', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          participant.creatorUserId,
          `You received a ${campaign.currency} ${(amountCents / 100).toFixed(2)} performance bonus for ${reason}.`,
          `/campaigns/${campaign.slug}/performance`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.bonus_awarded', 'campaign_application', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          participant.applicationId,
          JSON.stringify({ amountCents, bonusType, reason }),
        ),
    ]);
    throw redirect(`/campaigns/${campaign.slug}/performance?saved=1`);
  }

  throw new Response("Unsupported campaign performance action.", {
    status: 400,
  });
}

export default function CampaignPerformance({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const { campaign, ownApplication, operator } = loaderData;
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: campaign.currency,
  });
  const ownBonuses = ownApplication
    ? loaderData.bonuses.filter(
        (bonus) => bonus.applicationId === ownApplication.applicationId,
      )
    : [];
  const ownBonusTotal = ownBonuses.reduce(
    (sum, bonus) => sum + bonus.amountCents,
    0,
  );
  const paymentLabel =
    campaign.paymentFrequency === "custom"
      ? campaign.customPaymentLabel
      : campaign.paymentFrequency.replace("_", " ");
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <Link className="quiet-link" to={`/campaigns/${campaign.slug}`}>
          Back to campaign
        </Link>
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Campaign performance</span>
            <h1>{campaign.title}</h1>
            <p>
              Submit every public content URL. AKARI records final engagement
              manually now and can use the same evidence structure for APIs
              later.
            </p>
          </div>
          {operator && (
            <div className="button-row">
              <Link
                className="button button-quiet"
                to={`/admin/campaign-compensation/${campaign.slug}`}
              >
                Compensation console
              </Link>
              <Link
                className="button button-primary"
                to={`/admin/campaign-compensation/${campaign.slug}/report.xls`}
              >
                Download report
              </Link>
            </div>
          )}
        </header>
        {loaderData.saved && (
          <p className="notice success">Campaign performance updated.</p>
        )}
        {actionData?.error && <p className="form-error">{actionData.error}</p>}
        <section className="admin-panel">
          <span className="chapter">Participant roster</span>
          <h2>{loaderData.participants.length} Creators participating.</h2>
          <div className="interest-grid">
            {loaderData.participants.map((participant) => (
              <Link
                key={participant.applicationId}
                to={`/profiles/${participant.username}`}
              >
                <strong>{participant.displayName}</strong>
                <small>
                  {parseCampaignPlatforms(participant.selectedPlatformsJson)
                    .map((platform) => platformLabels[platform])
                    .join(", ")}
                </small>
              </Link>
            ))}
          </div>
          <p>Individual Creator payments and bonuses are never shown here.</p>
        </section>
        {ownApplication && (
          <>
            <section className="admin-panel">
              <span className="chapter">Your private campaign package</span>
              <h2>
                Expected {paymentLabel}:{" "}
                {money.format(ownApplication.payoutCents / 100)}
              </h2>
              <p>
                Approved bonuses: {money.format(ownBonusTotal / 100)} · current
                potential total:{" "}
                {money.format(
                  (ownApplication.payoutCents + ownBonusTotal) / 100,
                )}
              </p>
              {Object.entries(
                parseJsonObject<Record<string, string>>(
                  ownApplication.platformCommitmentsJson,
                  {},
                ),
              ).map(([platform, commitment]) => (
                <p key={platform}>
                  <strong>
                    {platformLabels[platform as CampaignPlatform] ?? platform}:
                  </strong>{" "}
                  {commitment}
                </p>
              ))}
              <p>
                Posting days:{" "}
                {parsePostingDays(ownApplication.postingDaysJson)
                  .map(
                    (value) =>
                      postingDays.find((day) => day.value === value)?.label,
                  )
                  .filter(Boolean)
                  .join(", ") || "Use the agreed campaign cadence"}
              </p>
            </section>
            <section className="admin-panel">
              <span className="chapter">Submit campaign content</span>
              <h2>Add every published URL.</h2>
              <Form method="post" className="profile-form">
                <input type="hidden" name="intent" value="submit-content" />
                <label>
                  Channel
                  <select name="platform" required defaultValue="">
                    <option value="" disabled>
                      Choose a committed channel
                    </option>
                    {parseCampaignPlatforms(
                      ownApplication.selectedPlatformsJson,
                    ).map((platform) => (
                      <option key={platform} value={platform}>
                        {platformLabels[platform]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-row">
                  <label>
                    Published date
                    <input name="publishedAt" type="date" required />
                  </label>
                  <label>
                    Public content URL
                    <input name="workUrl" type="url" required />
                  </label>
                </div>
                <button
                  className="button button-primary"
                  disabled={navigation.state !== "idle"}
                >
                  Submit content URL
                </button>
              </Form>
            </section>
          </>
        )}
        {operator && (
          <section className="application-list">
            <header>
              <span className="eyebrow">Private Creator packages</span>
              <h2>Performance bonuses.</h2>
            </header>
            {loaderData.participants.map((participant) => {
              const bonuses = loaderData.bonuses.filter(
                (bonus) => bonus.applicationId === participant.applicationId,
              );
              const bonusTotal = bonuses.reduce(
                (sum, bonus) => sum + bonus.amountCents,
                0,
              );
              return (
                <article
                  className="application-card"
                  key={participant.applicationId}
                >
                  <div>
                    <span className="chapter">Private payment</span>
                    <h3>{participant.displayName}</h3>
                    <p>
                      Base: {money.format(participant.payoutCents / 100)} ·
                      bonus: {money.format(bonusTotal / 100)}
                    </p>
                    {bonuses.map((bonus) => (
                      <small key={bonus.id}>
                        {bonus.bonusType}:{" "}
                        {money.format(bonus.amountCents / 100)} · {bonus.reason}
                      </small>
                    ))}
                  </div>
                  <Form method="post" className="profile-form">
                    <input type="hidden" name="intent" value="award-bonus" />
                    <input
                      type="hidden"
                      name="applicationId"
                      value={participant.applicationId}
                    />
                    <div className="form-row">
                      <label>
                        Bonus amount ({campaign.currency})
                        <input
                          name="amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                        />
                      </label>
                      <label>
                        Bonus type
                        <select name="bonusType" required defaultValue="">
                          <option value="" disabled>
                            Choose a reason category
                          </option>
                          {bonusTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Performance reason
                      <textarea
                        name="reason"
                        minLength={10}
                        maxLength={500}
                        required
                      />
                    </label>
                    <div className="form-row">
                      <label>
                        Period label
                        <input
                          name="periodLabel"
                          maxLength={100}
                          placeholder="Week 2"
                        />
                      </label>
                      <label>
                        Evidence URL
                        <input name="evidenceUrl" type="url" />
                      </label>
                    </div>
                    <button className="button button-quiet">
                      Award performance bonus
                    </button>
                  </Form>
                </article>
              );
            })}
          </section>
        )}
        <section className="application-list">
          <header>
            <span className="eyebrow">Submitted content</span>
            <h2>Delivery and final engagement evidence.</h2>
          </header>
          {loaderData.content.map((content) => (
            <article className="application-card" key={content.id}>
              <div>
                <span className="chapter">
                  {platformLabels[content.platform]} · {content.status}
                </span>
                <h3>
                  {operator ? content.creatorName : "Your submitted content"}
                </h3>
                <a
                  className="quiet-link"
                  href={content.workUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open content
                </a>
                <p>
                  {content.publishedAt} · {content.views.toLocaleString()} views
                  · {content.likes.toLocaleString()} likes ·{" "}
                  {content.comments.toLocaleString()} comments ·{" "}
                  {content.reposts.toLocaleString()} reposts ·{" "}
                  {content.bookmarks.toLocaleString()} bookmarks
                </p>
                {content.metricSource && (
                  <small>
                    Metrics: {content.metricSource} · {content.metricCapturedAt}
                  </small>
                )}
              </div>
              {operator && (
                <div>
                  <Form method="post" className="application-actions">
                    <input type="hidden" name="intent" value="review-content" />
                    <input type="hidden" name="contentId" value={content.id} />
                    <label>
                      Review note
                      <input name="reviewNote" maxLength={500} />
                    </label>
                    <button
                      name="status"
                      value="approved"
                      className="button button-primary"
                    >
                      Approve
                    </button>
                    <button
                      name="status"
                      value="rejected"
                      className="button button-quiet"
                    >
                      Reject
                    </button>
                  </Form>
                  <Form method="post" className="profile-form">
                    <input type="hidden" name="intent" value="record-metrics" />
                    <input type="hidden" name="contentId" value={content.id} />
                    <div className="form-row form-row-three">
                      {[
                        ["views", "Views", content.views],
                        ["likes", "Likes", content.likes],
                        ["comments", "Comments", content.comments],
                        ["reposts", "Reposts / shares", content.reposts],
                        ["bookmarks", "Bookmarks / saves", content.bookmarks],
                        ["clicks", "Clicks", content.clicks],
                      ].map(([name, label, value]) => (
                        <label key={String(name)}>
                          {String(label)}
                          <input
                            name={String(name)}
                            type="number"
                            min="0"
                            defaultValue={Number(value)}
                            required
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      Manual verification note
                      <input
                        name="verificationNote"
                        minLength={5}
                        maxLength={500}
                        required
                      />
                    </label>
                    <button className="button button-quiet">
                      Save final manual metrics
                    </button>
                  </Form>
                </div>
              )}
            </article>
          ))}
          {!loaderData.content.length && (
            <div className="status-card">
              <h2>No campaign URLs submitted yet.</h2>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
