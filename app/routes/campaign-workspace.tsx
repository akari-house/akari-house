import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/campaign-workspace";
import { SiteHeader } from "~/components/SiteHeader";
import { requireUser } from "~/lib/auth.server";
import {
  campaignPayoutSuggestion,
  expectedCampaignSlots,
  postingCadences,
  type PostingCadence,
} from "~/lib/campaign-delivery";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";
import { parsePostingDays, postingDays } from "~/lib/campaign-posting-days";

type Campaign = {
  id: string;
  slug: string;
  title: string;
  createdBy: string;
  status: string;
  registrationOpensAt: string | null;
  applicationDeadline: string | null;
  startsAt: string | null;
  endsAt: string | null;
  postingCadence: PostingCadence;
  campaignKind: string;
  projectTitle: string;
  currency: string;
};

type Application = {
  id: string;
  creatorUserId: string;
  creatorName: string;
  username: string;
  payoutCents: number;
  finalPayoutCents: number | null;
  postingDaysJson: string;
};

type Submission = {
  id: string;
  applicationId: string;
  creatorUserId: string;
  periodStart: string;
  slotNumber: number;
  workUrl: string;
  status: string;
  reviewNote: string;
  creatorName: string;
};

async function getCampaign(db: D1Database, slug: string | undefined) {
  return db
    .prepare(
      `SELECT c.id, c.slug, c.title, c.created_by AS createdBy, c.status,
              c.registration_opens_at AS registrationOpensAt,
              c.application_deadline AS applicationDeadline,
              c.starts_at AS startsAt, c.ends_at AS endsAt,
              c.posting_cadence AS postingCadence, c.currency,
              c.campaign_kind AS campaignKind,
              p.title AS projectTitle
       FROM ambassador_campaigns c
       JOIN projects p ON p.id = c.project_id
       WHERE c.slug = ?`,
    )
    .bind(slug)
    .first<Campaign>();
}

async function canModerateCampaign(
  db: D1Database,
  userId: string,
  campaign: Campaign,
) {
  if (campaign.createdBy === userId) return true;
  return Boolean(
    await db
      .prepare(
        `SELECT 1 FROM admin_users au
         LEFT JOIN admin_scopes s ON s.admin_user_id = au.user_id
           AND s.scope IN ('campaigns', 'moderation')
         LEFT JOIN campaign_moderators cm
           ON cm.user_id = au.user_id AND cm.campaign_id = ?
         WHERE au.user_id = ?
           AND (au.access_level = 'superadmin' OR s.scope IS NOT NULL
                OR cm.user_id IS NOT NULL)`,
      )
      .bind(campaign.id, userId)
      .first(),
  );
}

async function acceptedApplications(db: D1Database, campaignId: string) {
  return (
    await db
      .prepare(
        `SELECT ca.id, ca.creator_user_id AS creatorUserId,
                p.display_name AS creatorName, u.username,
                ca.payout_cents AS payoutCents,
                ca.final_payout_cents AS finalPayoutCents,
                ca.posting_days_json AS postingDaysJson
         FROM campaign_applications ca
         JOIN users u ON u.id = ca.creator_user_id
         JOIN profiles p ON p.user_id = ca.creator_user_id
         WHERE ca.campaign_id = ? AND ca.status = 'accepted'
         ORDER BY p.display_name`,
      )
      .bind(campaignId)
      .all<Application>()
  ).results;
}

async function campaignSubmissions(db: D1Database, campaignId: string) {
  return (
    await db
      .prepare(
        `SELECT s.id, s.application_id AS applicationId,
                s.creator_user_id AS creatorUserId,
                s.period_start AS periodStart, s.slot_number AS slotNumber,
                s.work_url AS workUrl, s.status, s.review_note AS reviewNote,
                p.display_name AS creatorName
         FROM campaign_work_submissions s
         JOIN profiles p ON p.user_id = s.creator_user_id
         WHERE s.campaign_id = ?
         ORDER BY s.period_start DESC, s.slot_number, s.created_at DESC`,
      )
      .bind(campaignId)
      .all<Submission>()
  ).results;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const campaign = await getCampaign(db, params.slug);
  if (!campaign) throw new Response("Campaign not found.", { status: 404 });
  const moderator =
    user.accessTier === "member" &&
    (await canModerateCampaign(db, user.id, campaign));
  const applications = await acceptedApplications(db, campaign.id);
  const ownApplication = applications.find(
    (application) => application.creatorUserId === user.id,
  );
  if (!moderator && !ownApplication)
    throw new Response("Accepted Creators only.", { status: 403 });
  const submissions = await campaignSubmissions(db, campaign.id);
  const superadmin = Boolean(
    await db
      .prepare(
        `SELECT 1 FROM admin_users
         WHERE user_id = ? AND access_level = 'superadmin'`,
      )
      .bind(user.id)
      .first(),
  );
  const eligibleModerators = superadmin
    ? (
        await db
          .prepare(
            `SELECT u.id, p.display_name AS displayName,
                    CASE WHEN cm.user_id IS NULL THEN 0 ELSE 1 END AS assigned
             FROM admin_users au
             JOIN users u ON u.id = au.user_id
             JOIN profiles p ON p.user_id = u.id
             LEFT JOIN campaign_moderators cm
               ON cm.user_id = u.id AND cm.campaign_id = ?
             WHERE u.id <> ?
             ORDER BY p.display_name`,
          )
          .bind(campaign.id, user.id)
          .all<{ id: string; displayName: string; assigned: number }>()
      ).results
    : [];
  const visibleSubmissions = moderator
    ? submissions
    : submissions.filter((submission) => submission.creatorUserId === user.id);
  return {
    user,
    campaign,
    moderator,
    superadmin,
    eligibleModerators,
    applications: moderator
      ? applications
      : ownApplication
        ? [ownApplication]
        : [],
    submissions: visibleSubmissions,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const campaign = await getCampaign(db, params.slug);
  if (!campaign) throw new Response("Campaign not found.", { status: 404 });
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const moderator =
    user.accessTier === "member" &&
    (await canModerateCampaign(db, user.id, campaign));
  if (intent === "assign-moderator" || intent === "remove-moderator") {
    const superadmin = await db
      .prepare(
        `SELECT 1 FROM admin_users
         WHERE user_id = ? AND access_level = 'superadmin'`,
      )
      .bind(user.id)
      .first();
    if (!superadmin)
      throw new Response("Superadmin access required.", { status: 403 });
    const moderatorUserId = formText(form.get("moderatorUserId"));
    const eligible = await db
      .prepare("SELECT 1 FROM admin_users WHERE user_id = ?")
      .bind(moderatorUserId)
      .first();
    if (!eligible) return { error: "Choose an AKARI administrator." };
    if (intent === "assign-moderator")
      await db
        .prepare(
          `INSERT OR IGNORE INTO campaign_moderators
           (campaign_id, user_id, assigned_by) VALUES (?, ?, ?)`,
        )
        .bind(campaign.id, moderatorUserId, user.id)
        .run();
    else
      await db
        .prepare(
          `DELETE FROM campaign_moderators
           WHERE campaign_id = ? AND user_id = ?`,
        )
        .bind(campaign.id, moderatorUserId)
        .run();
    return { moderatorSaved: true };
  }
  if (intent === "configure-schedule") {
    if (!moderator)
      throw new Response("Campaign moderation required.", { status: 403 });
    const registrationOpensAt = formText(
      form.get("registrationOpensAt"),
    ).trim();
    const applicationDeadline = formText(
      form.get("applicationDeadline"),
    ).trim();
    const startsAt = formText(form.get("startsAt")).trim();
    const endsAt = formText(form.get("endsAt")).trim();
    const postingCadence = formText(form.get("postingCadence"));
    if (
      !postingCadences.some((item) => item.value === postingCadence) ||
      !registrationOpensAt ||
      !applicationDeadline ||
      !startsAt ||
      !endsAt ||
      !(
        registrationOpensAt <= applicationDeadline &&
        applicationDeadline < startsAt &&
        startsAt <= endsAt
      )
    )
      return { error: "Use a valid registration and campaign date sequence." };
    await db
      .prepare(
        `UPDATE ambassador_campaigns
         SET registration_opens_at = ?, application_deadline = ?,
             starts_at = ?, ends_at = ?, posting_cadence = ?,
             updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(
        registrationOpensAt,
        applicationDeadline,
        startsAt,
        endsAt,
        postingCadence,
        campaign.id,
      )
      .run();
    return { scheduleSaved: true };
  }
  if (!campaign.startsAt || !campaign.endsAt)
    return { error: "Configure the campaign execution dates first." };

  if (intent === "submit-work") {
    const application = await db
      .prepare(
        `SELECT id, posting_days_json AS postingDaysJson
         FROM campaign_applications
         WHERE campaign_id = ? AND creator_user_id = ? AND status = 'accepted'`,
      )
      .bind(campaign.id, user.id)
      .first<{ id: string; postingDaysJson: string }>();
    if (!application)
      throw new Response("Accepted Creator required.", { status: 403 });
    const workUrlValue = formText(form.get("workUrl")).trim();
    let workUrl: URL;
    try {
      workUrl = new URL(workUrlValue);
      if (!["http:", "https:"].includes(workUrl.protocol)) throw new Error();
    } catch {
      return { error: "Add a valid public post URL." };
    }
    const slotValue = formText(form.get("slot"));
    const [periodStart, slotText] = slotValue.split("|");
    const slotNumber = Number(slotText);
    const dueSlots = expectedCampaignSlots(
      campaign.startsAt,
      campaign.endsAt,
      campaign.postingCadence,
      new Date(),
      parsePostingDays(application.postingDaysJson),
    );
    if (
      !dueSlots.some(
        (slot) =>
          slot.periodStart === periodStart && slot.slotNumber === slotNumber,
      )
    )
      return { error: "Choose an available campaign requirement." };
    await db.batch([
      db
        .prepare(
          `INSERT INTO campaign_work_submissions
           (id, campaign_id, application_id, creator_user_id, period_start,
            slot_number, work_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(application_id, period_start, slot_number) DO UPDATE SET
             work_url = excluded.work_url, status = 'submitted',
             review_note = '', reviewed_by = NULL, reviewed_at = NULL,
             updated_at = datetime('now')`,
        )
        .bind(
          crypto.randomUUID(),
          campaign.id,
          application.id,
          user.id,
          periodStart,
          slotNumber,
          workUrl.toString(),
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id)
           VALUES (?, ?, 'campaign.work_submitted', 'campaign', ?)`,
        )
        .bind(crypto.randomUUID(), user.id, campaign.id),
    ]);
    return { saved: true };
  }

  if (!moderator)
    throw new Response("Campaign moderation required.", { status: 403 });
  if (intent === "review-work") {
    const submissionId = formText(form.get("submissionId"));
    const status = formText(form.get("status"));
    const reviewNote = formText(form.get("reviewNote")).trim();
    if (!["approved", "rejected"].includes(status))
      throw new Response("Invalid review decision.", { status: 400 });
    if (status === "rejected" && reviewNote.length < 5)
      return { error: "Explain a rejected submission." };
    await db
      .prepare(
        `UPDATE campaign_work_submissions
         SET status = ?, review_note = ?, reviewed_by = ?,
             reviewed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ? AND campaign_id = ?`,
      )
      .bind(status, reviewNote, user.id, submissionId, campaign.id)
      .run();
    return { reviewed: true };
  }
  if (intent === "set-payout") {
    const applicationId = formText(form.get("applicationId"));
    const amount = Number(formText(form.get("amount")));
    const application = await db
      .prepare(
        `SELECT payout_cents AS payoutCents FROM campaign_applications
         WHERE id = ? AND campaign_id = ? AND status = 'accepted'`,
      )
      .bind(applicationId, campaign.id)
      .first<{ payoutCents: number }>();
    if (
      !application ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount * 100 > application.payoutCents
    )
      return { error: "Final payout must be within the allocated amount." };
    if (new Date().toISOString().slice(0, 10) < campaign.endsAt.slice(0, 10))
      return { error: "Final payout can be decided after the campaign ends." };
    await db.batch([
      db
        .prepare(
          `UPDATE campaign_applications
           SET final_payout_cents = ?, payout_decided_by = ?,
               payout_decided_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(Math.round(amount * 100), user.id, applicationId),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.payout_decided',
                   'campaign_application', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          applicationId,
          JSON.stringify({ finalPayoutCents: Math.round(amount * 100) }),
        ),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           SELECT ?, creator_user_id, 'campaign.payout_decided',
                  'Campaign payout finalized', ?, ?
           FROM campaign_applications WHERE id = ?`,
        )
        .bind(
          crypto.randomUUID(),
          `Your final payout for ${campaign.title} has been decided.`,
          `/campaigns/${campaign.slug}/work`,
          applicationId,
        ),
    ]);
    return { payoutSaved: true };
  }
  if (intent === "set-allocation" && campaign.campaignKind !== "iio") {
    const applicationId = formText(form.get("applicationId"));
    const amount = Number(formText(form.get("amount")));
    if (!Number.isFinite(amount) || amount < 0)
      return { error: "Allocation must be zero or greater." };
    await db
      .prepare(
        `UPDATE campaign_applications
         SET payout_cents = ?, updated_at = datetime('now')
         WHERE id = ? AND campaign_id = ? AND status = 'accepted'`,
      )
      .bind(Math.round(amount * 100), applicationId, campaign.id)
      .run();
    return { allocationSaved: true };
  }
  throw new Response("Unsupported action.", { status: 400 });
}

export default function CampaignWorkspace({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { campaign, moderator } = loaderData;
  const navigation = useNavigation();
  const cadence =
    postingCadences.find((item) => item.value === campaign.postingCadence)
      ?.label ?? campaign.postingCadence;
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: campaign.currency,
  });
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <Link className="quiet-link" to={`/campaigns/${campaign.slug}`}>
          Back to campaign
        </Link>
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Campaign workroom</span>
            <h1>{campaign.title}</h1>
            <p>
              {campaign.projectTitle} · {cadence}
            </p>
          </div>
        </header>
        {actionData?.error && <p className="form-error">{actionData.error}</p>}
        {(actionData?.saved ||
          actionData?.reviewed ||
          actionData?.payoutSaved ||
          actionData?.allocationSaved ||
          actionData?.moderatorSaved ||
          actionData?.scheduleSaved) && (
          <p className="notice success">Campaign workroom updated.</p>
        )}
        <section className="iio-command-bar">
          <div>
            <strong>{campaign.startsAt?.slice(0, 10) ?? "Not set"}</strong>
            <span>campaign starts</span>
          </div>
          <div>
            <strong>{campaign.endsAt?.slice(0, 10) ?? "Not set"}</strong>
            <span>campaign ends</span>
          </div>
          <div>
            <strong>Flexible</strong>
            <span>Creator-selected posting days</span>
          </div>
        </section>
        {moderator && (
          <section className="admin-panel">
            <span className="chapter">Campaign schedule</span>
            <h2>Registration and delivery commitment</h2>
            <Form method="post" className="profile-form">
              <input type="hidden" name="intent" value="configure-schedule" />
              <div className="form-row">
                <label>
                  Registration opens
                  <input
                    name="registrationOpensAt"
                    type="date"
                    defaultValue={campaign.registrationOpensAt?.slice(0, 10)}
                    required
                  />
                </label>
                <label>
                  Registration closes
                  <input
                    name="applicationDeadline"
                    type="date"
                    defaultValue={campaign.applicationDeadline?.slice(0, 10)}
                    required
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Campaign starts
                  <input
                    name="startsAt"
                    type="date"
                    defaultValue={campaign.startsAt?.slice(0, 10)}
                    required
                  />
                </label>
                <label>
                  Campaign ends
                  <input
                    name="endsAt"
                    type="date"
                    defaultValue={campaign.endsAt?.slice(0, 10)}
                    required
                  />
                </label>
              </div>
              <label>
                Creator commitment
                <select
                  name="postingCadence"
                  defaultValue={campaign.postingCadence}
                  required
                >
                  {postingCadences.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button button-primary">Save schedule</button>
            </Form>
          </section>
        )}
        {loaderData.superadmin && (
          <section className="admin-panel">
            <span className="chapter">Campaign access</span>
            <h2>Assigned moderators</h2>
            <p>
              Assign an existing AKARI administrator to review work and decide
              final payouts for this campaign.
            </p>
            {loaderData.eligibleModerators.map((admin) => (
              <Form
                method="post"
                className="application-actions"
                key={admin.id}
              >
                <input type="hidden" name="moderatorUserId" value={admin.id} />
                <strong>{admin.displayName}</strong>
                <button
                  className={
                    admin.assigned
                      ? "button button-quiet"
                      : "button button-primary"
                  }
                  name="intent"
                  value={
                    admin.assigned ? "remove-moderator" : "assign-moderator"
                  }
                >
                  {admin.assigned ? "Remove access" : "Assign moderator"}
                </button>
              </Form>
            ))}
          </section>
        )}
        {loaderData.applications.map((application) => {
          const selectedDays = parsePostingDays(application.postingDaysJson);
          const allSlots =
            campaign.startsAt && campaign.endsAt
              ? expectedCampaignSlots(
                  campaign.startsAt,
                  campaign.endsAt,
                  campaign.postingCadence,
                  new Date(`${campaign.endsAt.slice(0, 10)}T23:59:59.000Z`),
                  selectedDays,
                )
              : [];
          const dueSlots =
            campaign.startsAt && campaign.endsAt
              ? expectedCampaignSlots(
                  campaign.startsAt,
                  campaign.endsAt,
                  campaign.postingCadence,
                  new Date(),
                  selectedDays,
                )
              : [];
          const submissions = loaderData.submissions.filter(
            (submission) => submission.applicationId === application.id,
          );
          const completed = submissions.filter(
            (submission) => submission.status !== "rejected",
          ).length;
          const approved = submissions.filter(
            (submission) => submission.status === "approved",
          ).length;
          const suggestion = campaignPayoutSuggestion(
            application.payoutCents,
            allSlots.length,
            completed,
          );
          const submittedKeys = new Set(
            submissions
              .filter((submission) => submission.status !== "rejected")
              .map(
                (submission) =>
                  `${submission.periodStart}|${submission.slotNumber}`,
              ),
          );
          const availableSlots = dueSlots.filter(
            (slot) =>
              !submittedKeys.has(`${slot.periodStart}|${slot.slotNumber}`),
          );
          return (
            <section className="admin-panel" key={application.id}>
              <span className="chapter">
                {moderator ? application.creatorName : "Your delivery record"}
              </span>
              <h2>
                {completed} of {allSlots.length} submitted
              </h2>
              <p>
                {approved} approved · Suggested payout{" "}
                <strong>{money.format(suggestion / 100)}</strong> from{" "}
                {money.format(application.payoutCents / 100)} allocated.
              </p>
              <p>
                Posting days:{" "}
                {selectedDays
                  .map(
                    (value) =>
                      postingDays.find((day) => day.value === value)?.short,
                  )
                  .filter(Boolean)
                  .join(", ")}
              </p>
              {!moderator && availableSlots.length > 0 && (
                <Form method="post" className="profile-form">
                  <input type="hidden" name="intent" value="submit-work" />
                  <label>
                    Requirement
                    <select name="slot" required defaultValue="">
                      <option value="" disabled>
                        Choose a due requirement
                      </option>
                      {availableSlots.map((slot) => (
                        <option
                          key={`${slot.periodStart}-${slot.slotNumber}`}
                          value={`${slot.periodStart}|${slot.slotNumber}`}
                        >
                          {slot.periodStart} · item {slot.slotNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Public work URL
                    <input name="workUrl" type="url" required />
                  </label>
                  <button
                    className="button button-primary"
                    disabled={navigation.state !== "idle"}
                  >
                    Submit work
                  </button>
                </Form>
              )}
              {moderator && (
                <>
                  {campaign.campaignKind !== "iio" && (
                    <Form method="post" className="application-actions">
                      <input
                        type="hidden"
                        name="intent"
                        value="set-allocation"
                      />
                      <input
                        type="hidden"
                        name="applicationId"
                        value={application.id}
                      />
                      <label>
                        Allocated amount ({campaign.currency})
                        <input
                          name="amount"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={application.payoutCents / 100}
                          required
                        />
                      </label>
                      <button className="button button-quiet">
                        Save allocation
                      </button>
                    </Form>
                  )}
                  <Form method="post" className="application-actions">
                    <input type="hidden" name="intent" value="set-payout" />
                    <input
                      type="hidden"
                      name="applicationId"
                      value={application.id}
                    />
                    <label>
                      Final payout ({campaign.currency})
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        max={application.payoutCents / 100}
                        step="0.01"
                        defaultValue={
                          (application.finalPayoutCents ?? suggestion) / 100
                        }
                        required
                      />
                    </label>
                    <button className="button button-primary">
                      Save final payout after campaign
                    </button>
                  </Form>
                </>
              )}
              <div className="application-list">
                {submissions.map((submission) => (
                  <article className="application-card" key={submission.id}>
                    <div>
                      <span className="chapter">{submission.status}</span>
                      <strong>
                        {submission.periodStart} · item {submission.slotNumber}
                      </strong>
                      <a
                        className="quiet-link"
                        href={submission.workUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open submitted work
                      </a>
                      {submission.reviewNote && <p>{submission.reviewNote}</p>}
                    </div>
                    {moderator && (
                      <Form method="post" className="application-actions">
                        <input
                          type="hidden"
                          name="intent"
                          value="review-work"
                        />
                        <input
                          type="hidden"
                          name="submissionId"
                          value={submission.id}
                        />
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
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
