import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/campaign-detail";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser, requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const campaign = await db
    .prepare(
      `SELECT c.id, c.slug, c.title, c.summary, c.brief, c.deliverables,
              c.compensation, c.application_deadline AS applicationDeadline,
              c.status, c.created_by AS createdBy,
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
      status: string;
      createdBy: string;
      projectId: string;
      projectSlug: string;
      projectTitle: string;
    }>();
  if (
    !campaign ||
    (campaign.status !== "published" && user?.id !== campaign.createdBy)
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
          `SELECT status FROM campaign_applications
           WHERE campaign_id = ? AND creator_user_id = ?`,
        )
        .bind(campaign.id, user.id)
        .first<{ status: string }>()
    : null;
  const applications =
    user?.id === campaign.createdBy
      ? await db
          .prepare(
            `SELECT ca.id, ca.message, ca.portfolio_url AS portfolioUrl,
                    ca.contact_sharing AS contactSharing, ca.status,
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
          }>()
      : null;
  return {
    user,
    campaign,
    following,
    application,
    applications: applications?.results ?? [],
    submitted: new URL(request.url).searchParams.has("submitted"),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const campaign = await db
    .prepare(
      `SELECT c.id, c.project_id AS projectId, c.title, c.created_by AS createdBy
       FROM ambassador_campaigns c
       WHERE c.slug = ? AND c.status = 'published'`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      projectId: string;
      title: string;
      createdBy: string;
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
  const portfolioUrl = formText(form.get("portfolioUrl")).trim();
  const shareContact = form.get("shareContact") === "yes" ? 1 : 0;
  if (message.length < 30 || message.length > 1200)
    return { error: "Write an application between 30 and 1,200 characters." };
  await db.batch([
    db
      .prepare(
        `INSERT INTO campaign_applications
         (id, campaign_id, creator_user_id, message, portfolio_url,
          contact_sharing, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'submitted', datetime('now'))
         ON CONFLICT(campaign_id, creator_user_id) DO UPDATE SET
           message = excluded.message, portfolio_url = excluded.portfolio_url,
           contact_sharing = excluded.contact_sharing, status = 'submitted',
           updated_at = excluded.updated_at`,
      )
      .bind(
        crypto.randomUUID(),
        campaign.id,
        user.id,
        message,
        portfolioUrl,
        shareContact,
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
  return (
    <div className="site-shell">
      <SiteHeader user={user} />
      <main id="main-content" className="project-detail-main">
        {loaderData.submitted && (
          <p className="notice success">Campaign submitted for AKARI review.</p>
        )}
        <span className="chapter">Ambassador campaign · {campaign.status}</span>
        <h1>{campaign.title}</h1>
        <p className="project-lede">{campaign.summary}</p>
        <p className="project-story">{campaign.brief}</p>
        <section className="project-action-panel">
          <h2>Deliverables</h2><p>{campaign.deliverables}</p>
          <h2>Compensation and terms</h2><p>{campaign.compensation}</p>
        </section>
        <p>
          Campaign by{" "}
          <Link to={`/projects/${campaign.projectSlug}`}>
            {campaign.projectTitle}
          </Link>
        </p>
        {user?.roles.includes("creator") && user.id !== campaign.createdBy && (
          <section className="project-action-panel">
            <h2>Apply as a Creator</h2>
            {!loaderData.following && (
              <p>
                First follow <Link to={`/projects/${campaign.projectSlug}`}>
                  {campaign.projectTitle}
                </Link>. This confirms that you have seen the project context.
              </p>
            )}
            {actionData?.error && <p className="form-error">{actionData.error}</p>}
            <Form method="post" className="form-stack">
              <label>Why are you a strong fit?<textarea name="message" minLength={30} maxLength={1200} rows={6} required /></label>
              <label>Relevant portfolio URL<input name="portfolioUrl" type="url" /></label>
              <label className="inline-choice"><input type="checkbox" name="shareContact" value="yes" />Share my project-contact methods with this campaign owner</label>
              <button className="button button-primary" name="intent" value="apply" disabled={!loaderData.following || navigation.state !== "idle"}>
                {loaderData.application ? "Update application" : "Apply to campaign"}
              </button>
              {loaderData.application?.status !== "withdrawn" && loaderData.application && (
                <button className="text-button" name="intent" value="withdraw">Withdraw application</button>
              )}
            </Form>
          </section>
        )}
        {user?.id === campaign.createdBy && (
          <section className="project-interest-list">
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
                  <p>{application.message}</p>
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
                    <button name="status" value="shortlisted" className="button button-quiet">
                      Shortlist
                    </button>
                    <button name="status" value="accepted" className="button button-primary">
                      Accept
                    </button>
                    <button name="status" value="declined" className="button button-quiet">
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
