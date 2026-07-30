import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/campaign-commitment";
import { SiteHeader } from "~/components/SiteHeader";
import {
  campaignPlatforms,
  parseCampaignPlatforms,
  type CampaignPlatform,
} from "~/lib/campaign-compensation";
import { parseJsonObject } from "~/lib/campaign-json";
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

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const campaign = await db
    .prepare(
      `SELECT id, slug, title, posting_cadence AS postingCadence,
              daily_engagement_required AS dailyEngagementRequired,
              engagement_actions_json AS engagementActionsJson
       FROM ambassador_campaigns WHERE slug = ?`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      slug: string;
      title: string;
      postingCadence: string;
      dailyEngagementRequired: number;
      engagementActionsJson: string;
    }>();
  if (!campaign) throw new Response("Campaign not found.", { status: 404 });
  const application = await db
    .prepare(
      `SELECT id, status, selected_platforms_json AS selectedPlatformsJson,
              platform_commitments_json AS platformCommitmentsJson,
              engagement_accepted AS engagementAccepted,
              posting_days_json AS postingDaysJson
       FROM campaign_applications
       WHERE campaign_id = ? AND creator_user_id = ? AND status <> 'withdrawn'`,
    )
    .bind(campaign.id, user.id)
    .first<{
      id: string;
      status: string;
      selectedPlatformsJson: string;
      platformCommitmentsJson: string;
      engagementAccepted: number;
      postingDaysJson: string;
    }>();
  if (!application)
    throw new Response("Apply to this campaign before confirming channels.", {
      status: 403,
    });
  const socials = await db
    .prepare(
      `SELECT platform, profile_url AS profileUrl,
              COALESCE(follower_count, 0) AS followerCount
       FROM profile_social_accounts
       WHERE user_id = ? AND platform IN ('x','youtube','tiktok','instagram')`,
    )
    .bind(user.id)
    .all<{
      platform: CampaignPlatform;
      profileUrl: string;
      followerCount: number;
    }>();
  return {
    user,
    campaign,
    application,
    socials: socials.results,
    saved: new URL(request.url).searchParams.has("saved"),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const campaign = await db
    .prepare(
      `SELECT id, daily_engagement_required AS dailyEngagementRequired
       FROM ambassador_campaigns WHERE slug = ?`,
    )
    .bind(params.slug)
    .first<{ id: string; dailyEngagementRequired: number }>();
  if (!campaign) throw new Response("Campaign not found.", { status: 404 });
  const application = await db
    .prepare(
      `SELECT id, status FROM campaign_applications
       WHERE campaign_id = ? AND creator_user_id = ? AND status <> 'withdrawn'`,
    )
    .bind(campaign.id, user.id)
    .first<{ id: string; status: string }>();
  if (!application)
    throw new Response("Campaign application required.", { status: 403 });
  if (["accepted", "declined"].includes(application.status))
    return { error: "Finalized campaign commitments cannot be changed." };

  const form = await request.formData();
  const selected = campaignPlatforms.filter(
    (platform) => form.get(`platform_${platform}`) === "yes",
  );
  if (!selected.length)
    return { error: "Choose at least one campaign channel." };
  const socials = await db
    .prepare(
      `SELECT platform, profile_url AS profileUrl
       FROM profile_social_accounts
       WHERE user_id = ? AND platform IN ('x','youtube','tiktok','instagram')`,
    )
    .bind(user.id)
    .all<{ platform: CampaignPlatform; profileUrl: string }>();
  const socialMap = new Map(
    socials.results.map((social) => [social.platform, social.profileUrl]),
  );
  const missing = selected.find((platform) => !socialMap.get(platform));
  if (missing)
    return {
      error: `Add your ${platformLabels[missing]} profile to AKARI before selecting it for this campaign.`,
    };
  const commitments = Object.fromEntries(
    selected.map((platform) => [
      platform,
      formText(form.get(`commitment_${platform}`)).trim(),
    ]),
  ) as Record<CampaignPlatform, string>;
  if (
    selected.some(
      (platform) =>
        commitments[platform].length < 5 || commitments[platform].length > 500,
    )
  )
    return {
      error:
        "Describe the work for every selected channel in 5 to 500 characters.",
    };
  const engagementAccepted = form.get("engagementAccepted") === "yes" ? 1 : 0;
  if (campaign.dailyEngagementRequired && !engagementAccepted)
    return { error: "Accept the campaign's daily engagement requirement." };

  await db.batch([
    db
      .prepare(
        `UPDATE campaign_applications
         SET selected_platforms_json = ?, platform_commitments_json = ?,
             engagement_accepted = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        JSON.stringify(selected),
        JSON.stringify(commitments),
        engagementAccepted,
        application.id,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'campaign.commitment_saved', 'campaign_application', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        application.id,
        JSON.stringify({ selectedPlatforms: selected }),
      ),
  ]);
  throw redirect(`/campaigns/${params.slug}/commitment?saved=1`);
}

export default function CampaignCommitment({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const selected = parseCampaignPlatforms(
    loaderData.application.selectedPlatformsJson,
  );
  const commitments = parseJsonObject<Record<string, string>>(
    loaderData.application.platformCommitmentsJson,
    {},
  );
  const socialMap = new Map(
    loaderData.socials.map((social) => [social.platform, social]),
  );
  let engagementActions: string[] = [];
  try {
    const parsed: unknown = JSON.parse(
      loaderData.campaign.engagementActionsJson,
    );
    if (Array.isArray(parsed))
      engagementActions = parsed.filter(
        (item): item is string => typeof item === "string",
      );
  } catch {
    engagementActions = [];
  }
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <Link
          className="quiet-link"
          to={`/campaigns/${loaderData.campaign.slug}`}
        >
          Back to campaign
        </Link>
        <span className="eyebrow">Creator campaign commitment</span>
        <h1>{loaderData.campaign.title}</h1>
        <p>
          Select only channels where you will publish campaign work. AKARI uses
          only these channels when reviewing your campaign fit and expected
          payment.
        </p>
        {loaderData.saved && (
          <p className="notice success">Campaign channels saved.</p>
        )}
        {actionData?.error && <p className="form-error">{actionData.error}</p>}
        <Form method="post" className="profile-form">
          {campaignPlatforms.map((platform) => {
            const social = socialMap.get(platform);
            return (
              <fieldset className="profile-panel" key={platform}>
                <label className="inline-choice">
                  <input
                    type="checkbox"
                    name={`platform_${platform}`}
                    value="yes"
                    defaultChecked={selected.includes(platform)}
                    disabled={!social?.profileUrl}
                  />
                  <span>
                    <strong>{platformLabels[platform]}</strong>
                    <small>
                      {social?.profileUrl
                        ? `${social.followerCount.toLocaleString()} current followers`
                        : "Add this social account in your AKARI profile first"}
                    </small>
                  </span>
                </label>
                <label>
                  Work commitment on {platformLabels[platform]}
                  <textarea
                    name={`commitment_${platform}`}
                    rows={3}
                    maxLength={500}
                    defaultValue={commitments[platform] ?? ""}
                    placeholder="Example: Three original posts each week on Monday, Wednesday and Friday."
                  />
                </label>
              </fieldset>
            );
          })}
          {loaderData.campaign.dailyEngagementRequired === 1 && (
            <label className="inline-choice">
              <input
                type="checkbox"
                name="engagementAccepted"
                value="yes"
                defaultChecked={loaderData.application.engagementAccepted === 1}
                required
              />
              <span>
                <strong>I accept the daily engagement requirement</strong>
                <small>
                  {engagementActions.length
                    ? engagementActions.join(", ")
                    : "Comment, Like, Repost and Bookmark as instructed"}
                </small>
              </span>
            </label>
          )}
          <button
            className="button button-primary"
            disabled={navigation.state !== "idle"}
          >
            Save campaign channels
          </button>
        </Form>
      </main>
    </div>
  );
}
