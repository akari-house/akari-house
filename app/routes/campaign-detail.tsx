import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/campaign-detail";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser, requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, isXProfileUrl, normalizeWebsite } from "~/lib/validation";
import {
  minimumPostingDays,
  parsePostingDays,
  postingDays,
} from "~/lib/campaign-posting-days";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const campaign = await db
    .prepare(
      `SELECT c.id, c.slug, c.title, c.summary, c.brief, c.deliverables,
              c.compensation, c.application_deadline AS applicationDeadline,
              c.registration_opens_at AS registrationOpensAt,
              c.starts_at AS startsAt, c.ends_at AS endsAt,
              c.posting_cadence AS postingCadence,
              c.status, c.created_by AS createdBy,
              c.campaign_kind AS campaignKind,
              c.finalized_at AS finalizedAt, c.currency,
              p.id AS projectId, p.slug AS projectSlug, p.title AS projectTitle
       FROM ambassador_campaigns c
       JOIN projects p ON p.id = c.project_id
       WHERE c.slug = ?`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      brief: string;
      deliverables: string;
      compensation: string;
      applicationDeadline: string | null;
      registrationOpensAt: string | null;
      startsAt: string | null;
      endsAt: string | null;
      postingCadence: string;
      status: string;
      createdBy: string;
      campaignKind: string;
      finalizedAt: string | null;
      currency: string;
      projectId: string;
      projectSlug: string;
      projectTitle: string;
    }>();
  if (
    !campaign ||
    (!["published", "closed"].includes(campaign.status) &&
      user?.id !== campaign.createdBy)
  )
    throw new Response("Campaign not found.", { status: 404 });
  const following = user
    ? Boolean(
        await db
          .prepare(
            "SELECT 1 FROM project_follows WHERE project_id = ? AND user_id = ?",
          )
          .bind(campaign.projectId, user.id)
          .first(),
      )
    : false;
  const application = user
    ? await db
        .prepare(
          `SELECT status, payout_cents AS payoutCents,
                  payout_percent AS payoutPercent,
                  final_payout_cents AS finalPayoutCents,
                  posting_days_json AS postingDaysJson
           FROM campaign_applications
           WHERE campaign_id = ? AND creator_user_id = ?`,
        )
        .bind(campaign.id, user.id)
        .first<{
          status: string;
          payoutCents: number;
          payoutPercent: number;
          finalPayoutCents: number | null;
          postingDaysJson: string;
        }>()
    : null;
  const applications =
    user?.id === campaign.createdBy
      ? await db
          .prepare(
            `SELECT ca.id, ca.message, ca.portfolio_url AS portfolioUrl,
                    ca.contact_sharing AS contactSharing, ca.status,
                    ca.posting_days_json AS postingDaysJson,
                    ca.x_url AS xUrl, ca.x_followers AS xFollowers,
                    ca.x_score AS xScore, ca.sorsa_score AS sorsaScore,
                    u.id AS creatorUserId, u.username,
                    p.display_name AS displayName,
                    rv.status AS verificationStatus
             FROM campaign_applications ca
             JOIN users u ON u.id = ca.creator_user_id
             JOIN profiles p ON p.user_id = ca.creator_user_id
             LEFT JOIN role_verifications rv
               ON rv.user_id = ca.creator_user_id AND rv.role = 'creator'
             WHERE ca.campaign_id = ? AND ca.status <> 'withdrawn'
             ORDER BY ca.created_at`,
          )
          .bind(campaign.id)
          .all<{
            id: string;
            message: string;
            portfolioUrl: string;
            contactSharing: number;
            status: string;
            creatorUserId: string;
            username: string;
            displayName: string;
            verificationStatus: string | null;
            postingDaysJson: string;
            xUrl: string | null;
            xFollowers: number | null;
            xScore: number | null;
            sorsaScore: number | null;
          }>()
      : null;
  const reputationSignals = user
    ? await db
        .prepare(
          `SELECT x_score AS xScore, x_score_source AS xScoreSource,
                  sorsa_score AS sorsaScore, sorsa_source AS sorsaSource,
                  updated_at AS updatedAt
           FROM profile_reputation_signals WHERE user_id = ?`,
        )
        .bind(user.id)
        .first<{
          xScore: number | null;
          xScoreSource: string;
          sorsaScore: number | null;
          sorsaSource: string;
          updatedAt: string;
        }>()
    : null;
  const socialAccounts = user
    ? (
        await db
          .prepare(
            `SELECT platform, profile_url AS profileUrl,
                    follower_count AS followerCount
             FROM profile_social_accounts
             WHERE user_id = ? AND platform IN ('x','tiktok','instagram','youtube')`,
          )
          .bind(user.id)
          .all<{
            platform: string;
            profileUrl: string;
            followerCount: number | null;
          }>()
      ).results
    : [];
  const xAccount = socialAccounts.find(
    (account) => account.platform === "x" && account.profileUrl,
  );
  return {
    user,
    campaign,
    following,
    application,
    applications: applications?.results ?? [],
    socialAccounts,
    reputationSignals,
    creatorReady: Boolean(
      xAccount &&
      isXProfileUrl(xAccount.profileUrl) &&
      xAccount.followerCount !== null &&
      reputationSignals?.xScore !== null &&
      reputationSignals?.sorsaScore !== null &&
      reputationSignals?.xScoreSource !== "unavailable" &&
      reputationSignals?.sorsaSource !== "unavailable",
    ),
    submitted: new URL(request.url).searchParams.has("submitted"),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const campaign = await db
    .prepare(
      `SELECT c.id, c.project_id AS projectId, c.title, c.created_by AS createdBy,
              c.campaign_kind AS campaignKind,
              c.posting_cadence AS postingCadence,
              c.registration_opens_at AS registrationOpensAt,
              c.application_deadline AS applicationDeadline
       FROM ambassador_campaigns c
       WHERE c.slug = ? AND c.status = 'published'`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      projectId: string;
      title: string;
      createdBy: string;
      campaignKind: string;
      postingCadence: string;
      registrationOpensAt: string | null;
      applicationDeadline: string | null;
    }>();
  if (!campaign) throw new Response("Campaign not found.", { status: 404 });
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  if (intent === "review-application") {
    if (user.id !== campaign.createdBy || user.accessTier !== "member")
      throw new Response("Campaign owner required.", { status: 403 });
    const applicationId = formText(form.get("applicationId"));
    const status = formText(form.get("status"));
    if (!["shortlisted", "accepted", "declined"].includes(status))
      throw new Response("Invalid application decision.", { status: 400 });
    const application = await db
      .prepare(
        `SELECT creator_user_id AS creatorUserId
         FROM campaign_applications
         WHERE id = ? AND campaign_id = ? AND status <> 'withdrawn'`,
      )
      .bind(applicationId, campaign.id)
      .first<{ creatorUserId: string }>();
    if (!application)
      throw new Response("Application not found.", { status: 404 });
    await db.batch([
      db
        .prepare(
          `UPDATE campaign_applications SET status = ?,
           updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(status, applicationId),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'campaign.application_status',
                   'Campaign application updated', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          application.creatorUserId,
          `Your application to ${campaign.title} is now ${status}.`,
          `/campaigns/${params.slug}`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.application_reviewed',
                   'campaign_application', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          applicationId,
          JSON.stringify({ status }),
        ),
    ]);
    throw redirect(`/campaigns/${params.slug}`);
  }
  if (!user.roles.includes("creator"))
    throw new Response("Creator role required.", { status: 403 });
  if (intent === "withdraw") {
    await db
      .prepare(
        `UPDATE campaign_applications SET status = 'withdrawn',
         updated_at = datetime('now')
         WHERE campaign_id = ? AND creator_user_id = ?`,
      )
      .bind(campaign.id, user.id)
      .run();
    throw redirect(`/campaigns/${params.slug}`);
  }
  if (intent !== "apply")
    throw new Response("Unsupported action.", { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  if (
    (campaign.registrationOpensAt && today < campaign.registrationOpensAt) ||
    (campaign.applicationDeadline && today > campaign.applicationDeadline)
  )
    return { error: "Campaign registration is not currently open." };
  const following = await db
    .prepare(
      "SELECT 1 FROM project_follows WHERE project_id = ? AND user_id = ?",
    )
    .bind(campaign.projectId, user.id)
    .first();
  if (!following)
    return {
      error: "Follow the project before applying to its campaign.",
    };
  const message = formText(form.get("message")).trim();
  const portfolioUrl = normalizeWebsite(form.get("portfolioUrl"));
  const shareContact = form.get("shareContact") === "yes" ? 1 : 0;
  const deliverablesAccepted =
    form.get("deliverablesAccepted") === "yes" ? 1 : 0;
  if (message.length < 30 || message.length > 1200)
    return { error: "Write an application between 30 and 1,200 characters." };
  if (portfolioUrl === null)
    return { error: "Use a valid HTTPS portfolio URL." };
  const readiness = await db
    .prepare(
      `SELECT p.display_name AS creatorName,
              x.profile_url AS xUrl, x.follower_count AS xFollowers,
              prs.x_score AS xScore, prs.x_score_source AS xScoreSource,
              prs.sorsa_score AS sorsaScore,
              prs.sorsa_source AS sorsaSource
       FROM profiles p
       LEFT JOIN profile_social_accounts x
         ON x.user_id = p.user_id AND x.platform = 'x'
       LEFT JOIN profile_reputation_signals prs ON prs.user_id = p.user_id
       WHERE p.user_id = ?`,
    )
    .bind(user.id)
    .first<{
      creatorName: string;
      xUrl: string | null;
      xFollowers: number | null;
      xScore: number | null;
      xScoreSource: string | null;
      sorsaScore: number | null;
      sorsaSource: string | null;
    }>();
  if (
    !readiness?.xUrl ||
    !isXProfileUrl(readiness.xUrl) ||
    readiness.xFollowers === null ||
    readiness.xScore === null ||
    readiness.sorsaScore === null ||
    readiness.xScoreSource === "unavailable" ||
    readiness.sorsaSource === "unavailable"
  )
    return {
      error:
        "Complete your primary X link, follower count, XScore and Sorsa score in your AKARI profile before applying.",
    };
  if (campaign.campaignKind === "iio" && !deliverablesAccepted)
    return { error: "Accept the campaign deliverables before applying." };
  const selectedPostingDays = Array.from(
    new Set(
      form
        .getAll("postingDays")
        .map((value) => Number(formText(value)))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  );
  if (selectedPostingDays.length < minimumPostingDays(campaign.postingCadence))
    return {
      error: `Choose at least ${minimumPostingDays(campaign.postingCadence)} posting day(s) for this cadence.`,
    };
  const optionalSocials = await db
    .prepare(
      `SELECT platform, profile_url AS profileUrl,
              COALESCE(follower_count, 0) AS followerCount
       FROM profile_social_accounts
       WHERE user_id = ? AND platform IN ('tiktok','instagram','youtube')`,
    )
    .bind(user.id)
    .all<{
      platform: string;
      profileUrl: string;
      followerCount: number;
    }>();
  const optionalByPlatform = new Map(
    optionalSocials.results.map((account) => [account.platform, account]),
  );
  await db.batch([
    db
      .prepare(
        `INSERT INTO campaign_applications
         (id, campaign_id, creator_user_id, message, portfolio_url,
          contact_sharing, status, updated_at, creator_name, x_url,
          tiktok_url, instagram_url, youtube_url, x_followers,
          tiktok_followers, instagram_followers, youtube_followers, x_score,
          sorsa_score, deliverables_accepted, posting_days_json)
         VALUES (?, ?, ?, ?, ?, ?, 'submitted', datetime('now'), ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(campaign_id, creator_user_id) DO UPDATE SET
           message = excluded.message, portfolio_url = excluded.portfolio_url,
           contact_sharing = excluded.contact_sharing, status = 'submitted',
           creator_name = excluded.creator_name, x_url = excluded.x_url,
           tiktok_url = excluded.tiktok_url,
           instagram_url = excluded.instagram_url,
           youtube_url = excluded.youtube_url,
           x_followers = excluded.x_followers, x_score = excluded.x_score,
           tiktok_followers = excluded.tiktok_followers,
           instagram_followers = excluded.instagram_followers,
           youtube_followers = excluded.youtube_followers,
           sorsa_score = excluded.sorsa_score,
           deliverables_accepted = excluded.deliverables_accepted,
           posting_days_json = excluded.posting_days_json,
           updated_at = excluded.updated_at`,
      )
      .bind(
        crypto.randomUUID(),
        campaign.id,
        user.id,
        message,
        portfolioUrl,
        shareContact,
        readiness.creatorName,
        readiness.xUrl,
        optionalByPlatform.get("tiktok")?.profileUrl ?? "",
        optionalByPlatform.get("instagram")?.profileUrl ?? "",
        optionalByPlatform.get("youtube")?.profileUrl ?? "",
        Math.round(readiness.xFollowers),
        Math.round(optionalByPlatform.get("tiktok")?.followerCount ?? 0),
        Math.round(optionalByPlatform.get("instagram")?.followerCount ?? 0),
        Math.round(optionalByPlatform.get("youtube")?.followerCount ?? 0),
        readiness.xScore,
        readiness.sorsaScore,
        deliverablesAccepted,
        JSON.stringify(selectedPostingDays),
      ),
    db
      .prepare(
        `INSERT INTO notifications
         (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'campaign.application', 'New creator application', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        campaign.createdBy,
        `${user.displayName} applied to ${campaign.title}.`,
        `/campaigns/${params.slug}`,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id)
         VALUES (?, ?, 'campaign.application_submitted', 'campaign', ?)`,
      )
      .bind(crypto.randomUUID(), user.id, campaign.id),
  ]);
  throw redirect(`/campaigns/${params.slug}?applied=1`);
}

export default function CampaignDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { campaign, user } = loaderData;
  const navigation = useNavigation();
  const socials = new Map(
    loaderData.socialAccounts.map((account) => [account.platform, account]),
  );
  return (
    <div className="site-shell">
      <SiteHeader user={user} />
      <main id="main-content" className="project-detail-main">
        {loaderData.submitted && (
          <p className="notice success">Campaign submitted for AKARI review.</p>
        )}
        <span className="chapter">
          {campaign.campaignKind === "iio"
            ? "IIO · Initial Interest Offering"
            : "Ambassador campaign"}{" "}
          · {campaign.status}
        </span>
        <h1>{campaign.title}</h1>
        <p className="project-lede">{campaign.summary}</p>
        <p className="project-story">{campaign.brief}</p>
        <section className="iio-command-bar">
          <div>
            <strong>{campaign.registrationOpensAt ?? "Announced soon"}</strong>
            <span>registration opens</span>
          </div>
          <div>
            <strong>{campaign.applicationDeadline ?? "Announced soon"}</strong>
            <span>registration closes</span>
          </div>
          <div>
            <strong>{campaign.startsAt ?? "Announced soon"}</strong>
            <span>campaign starts</span>
          </div>
          <div>
            <strong>{campaign.endsAt ?? "Announced soon"}</strong>
            <span>campaign ends</span>
          </div>
        </section>
        <section className="project-action-panel">
          <h2>Deliverables</h2>
          <p>{campaign.deliverables}</p>
          {campaign.campaignKind !== "iio" && (
            <>
              <h2>Compensation and terms</h2>
              <p>{campaign.compensation}</p>
            </>
          )}
        </section>
        <p>
          Campaign by{" "}
          <Link to={`/projects/${campaign.projectSlug}`}>
            {campaign.projectTitle}
          </Link>
        </p>
        {!user && (
          <section className="project-action-panel iio-join-gate">
            <span className="eyebrow">Creator access</span>
            <h2>Join AKARI before entering this offering.</h2>
            <p>
              Create one AKARI identity, add the Creator role, then return here
              to submit your socials and interest. AKARI House membership
              approval is not required to apply to an open Ambassador Campaign.
            </p>
            <div className="button-row">
              <Link className="button button-primary" to="/register">
                Register for AKARI
              </Link>
              <Link
                className="button button-quiet"
                to={`/login?returnTo=${encodeURIComponent(`/campaigns/${campaign.slug}`)}`}
              >
                Log in
              </Link>
            </div>
          </section>
        )}
        {user?.roles.includes("creator") &&
          user.id !== campaign.createdBy &&
          (campaign.status === "published" ||
            loaderData.application?.status === "accepted") && (
            <section className="project-action-panel">
              <h2>
                {campaign.campaignKind === "iio"
                  ? "Enter this IIO"
                  : "Apply as a Creator"}
              </h2>
              {campaign.finalizedAt &&
                loaderData.application?.status === "accepted" && (
                  <div className="iio-creator-allocation">
                    <span>Your finalized allocation</span>
                    <strong>
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: campaign.currency,
                      }).format(
                        (loaderData.application.payoutCents ?? 0) / 100,
                      )}
                    </strong>
                    <small>
                      {(loaderData.application.payoutPercent ?? 0).toFixed(2)}%
                      of the finalized Creator distribution
                    </small>
                  </div>
                )}
              {loaderData.application?.status === "accepted" &&
                campaign.startsAt &&
                campaign.endsAt && (
                  <Link
                    className="button button-primary"
                    to={`/campaigns/${campaign.slug}/work`}
                  >
                    Open your campaign workroom
                  </Link>
                )}
              {!loaderData.following && (
                <p>
                  First follow{" "}
                  <Link to={`/projects/${campaign.projectSlug}`}>
                    {campaign.projectTitle}
                  </Link>
                  . This confirms that you have seen the project context.
                </p>
              )}
              {!loaderData.creatorReady && (
                <div className="notice">
                  <strong>Creator campaign profile incomplete.</strong> Add a
                  valid primary X profile, follower count, XScore and Sorsa
                  score before applying. There is no minimum follower count.
                  <Link className="quiet-link" to="/app#creator-readiness">
                    Complete campaign profile
                  </Link>
                </div>
              )}
              {actionData?.error && (
                <p className="form-error">{actionData.error}</p>
              )}
              {campaign.status === "published" && (
                <Form method="post" className="form-stack">
                  <div className="status-card creator-readiness-summary">
                    <strong>Application identity</strong>
                    <span>
                      Primary X: {socials.get("x")?.profileUrl || "Missing"}
                    </span>
                    <span>
                      Followers: {socials.get("x")?.followerCount ?? "Missing"}
                    </span>
                    <span>
                      XScore:{" "}
                      {loaderData.reputationSignals?.xScore ?? "Missing"}
                    </span>
                    <span>
                      Sorsa score:{" "}
                      {loaderData.reputationSignals?.sorsaScore ?? "Missing"}
                    </span>
                  </div>
                  <fieldset className="profile-panel campaign-posting-days">
                    <legend>Which days will you post?</legend>
                    <p className="field-help">
                      Choose the days that fit your schedule. The campaign
                      cadence still determines the minimum number required.
                    </p>
                    <div className="interest-grid">
                      {postingDays.map((day) => (
                        <label key={day.value}>
                          <input
                            type="checkbox"
                            name="postingDays"
                            value={day.value}
                            defaultChecked={parsePostingDays(
                              loaderData.application?.postingDaysJson,
                            ).includes(day.value)}
                          />
                          <span>{day.short}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label>
                    Why are you a strong fit?
                    <textarea
                      name="message"
                      minLength={30}
                      maxLength={1200}
                      rows={6}
                      required
                    />
                  </label>
                  <label>
                    Relevant portfolio URL
                    <input name="portfolioUrl" type="url" />
                  </label>
                  <label className="inline-choice">
                    <input type="checkbox" name="shareContact" value="yes" />
                    Share my project-contact methods with this campaign owner
                  </label>
                  {campaign.campaignKind === "iio" && (
                    <label className="inline-choice">
                      <input
                        type="checkbox"
                        name="deliverablesAccepted"
                        value="yes"
                        required
                      />
                      I have read the brief and agree that selection requires
                      meeting the stated deliverables.
                    </label>
                  )}
                  <button
                    className="button button-primary"
                    name="intent"
                    value="apply"
                    disabled={
                      !loaderData.following ||
                      !loaderData.creatorReady ||
                      navigation.state !== "idle"
                    }
                  >
                    {loaderData.application
                      ? "Update application"
                      : "Apply to campaign"}
                  </button>
                  {loaderData.application?.status !== "withdrawn" &&
                    loaderData.application && (
                      <button
                        className="text-button"
                        name="intent"
                        value="withdraw"
                      >
                        Withdraw application
                      </button>
                    )}
                </Form>
              )}
            </section>
          )}
        {user?.id === campaign.createdBy && (
          <section className="project-interest-list">
            <Link
              className="button button-primary"
              to={`/campaigns/${campaign.slug}/work`}
            >
              Open delivery moderation
            </Link>
            <span className="eyebrow">Creator applications</span>
            <h2>People who want to participate.</h2>
            {loaderData.applications.length ? (
              loaderData.applications.map((application) => (
                <article key={application.id}>
                  <span className="chapter">
                    {application.verificationStatus ?? "not verified"} ·{" "}
                    {application.status}
                  </span>
                  <h3>
                    <Link to={`/profiles/${application.username}`}>
                      {application.displayName}
                    </Link>
                  </h3>
                  <div className="status-card creator-readiness-summary">
                    <span>
                      Followers: {application.xFollowers ?? "Unknown"}
                    </span>
                    <span>XScore: {application.xScore ?? "Unknown"}</span>
                    <span>Sorsa: {application.sorsaScore ?? "Unknown"}</span>
                    {application.xUrl && (
                      <a
                        className="quiet-link"
                        href={application.xUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open X profile
                      </a>
                    )}
                  </div>
                  <p>{application.message}</p>
                  <p>
                    Posting days:{" "}
                    {parsePostingDays(application.postingDaysJson)
                      .map(
                        (value) =>
                          postingDays.find((day) => day.value === value)?.short,
                      )
                      .filter(Boolean)
                      .join(", ") || "Not selected"}
                  </p>
                  {application.portfolioUrl && (
                    <a
                      className="quiet-link"
                      href={application.portfolioUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View submitted portfolio
                    </a>
                  )}
                  <Form method="post" className="application-actions">
                    <input
                      type="hidden"
                      name="applicationId"
                      value={application.id}
                    />
                    <input
                      type="hidden"
                      name="intent"
                      value="review-application"
                    />
                    <button
                      name="status"
                      value="shortlisted"
                      className="button button-quiet"
                    >
                      Shortlist
                    </button>
                    <button
                      name="status"
                      value="accepted"
                      className="button button-primary"
                    >
                      Accept
                    </button>
                    <button
                      name="status"
                      value="declined"
                      className="button button-quiet"
                    >
                      Decline
                    </button>
                  </Form>
                </article>
              ))
            ) : (
              <p>No Creator applications yet.</p>
            )}
          </section>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
