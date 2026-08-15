import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-detail";
import { ProjectNeedChips } from "~/components/projects/ProjectNeedChips";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser, requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { projectHasOpenNeed } from "~/lib/project-need-status";
import { userCanManageProject } from "~/lib/project-access.server";
import { projectHasNeed } from "~/lib/project-needs";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import { isVerifiedInvestor } from "~/lib/opportunity-access.server";
import { projectRelationshipLabel } from "~/lib/project-relationships";

type ProjectRow = {
  id: string;
  slug: string;
  founderUserId: string;
  founderName: string;
  founderUsername: string;
  title: string;
  summary: string;
  description: string;
  stage: string;
  seeking: string;
  supportStatus: string;
  status: string;
};

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const project = await db
    .prepare(
      `SELECT pr.id, pr.slug, pr.founder_user_id AS founderUserId, pr.title,
              pr.summary, pr.description, pr.stage, pr.seeking,
              pr.support_status_json AS supportStatus, pr.status,
              p.display_name AS founderName, u.username AS founderUsername
       FROM projects pr
       JOIN users u ON u.id = pr.founder_user_id
       JOIN profiles p ON p.user_id = u.id
       WHERE pr.slug = ?`,
    )
    .bind(params.slug)
    .first<ProjectRow>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  const canManage = user
    ? await userCanManageProject(db, project.id, user.id)
    : false;
  if (project.status !== "published" && !canManage)
    throw new Response("Project not found.", { status: 404 });

  const following = user
    ? Boolean(
        await db
          .prepare(
            "SELECT 1 FROM project_follows WHERE project_id = ? AND user_id = ?",
          )
          .bind(project.id, user.id)
          .first(),
      )
    : false;
  const ownInterest = user
    ? await db
        .prepare(
          `SELECT id, status,
                  investor_shares_contact AS investorSharesContact,
                  founder_shares_contact AS founderSharesContact
           FROM project_interests
           WHERE project_id = ? AND investor_user_id = ?`,
        )
        .bind(project.id, user.id)
        .first<{
          id: string;
          status: string;
          investorSharesContact: number;
          founderSharesContact: number;
        }>()
    : null;
  const interests = canManage
    ? await db
        .prepare(
          `SELECT pi.id, pi.message, pi.status,
                    pi.investor_shares_contact AS investorSharesContact,
                    pi.founder_shares_contact AS founderSharesContact,
                    u.id AS investorUserId, u.username,
                    p.display_name AS displayName,
                    group_concat(
                      CASE WHEN pi.investor_shares_contact = 1
                        AND pc.visibility IN (
                          'project_interests',
                          'connections_and_project_interests'
                        )
                      THEN pc.contact_type || ':' || pc.contact_value END,
                      '||'
                    ) AS sharedContacts
             FROM project_interests pi
             JOIN users u ON u.id = pi.investor_user_id
             JOIN profiles p ON p.user_id = u.id
             LEFT JOIN profile_contacts pc ON pc.user_id = u.id
             WHERE pi.project_id = ? AND pi.status <> 'withdrawn'
             GROUP BY pi.id ORDER BY pi.created_at DESC`,
        )
        .bind(project.id)
        .all<{
          id: string;
          message: string;
          status: string;
          investorSharesContact: number;
          founderSharesContact: number;
          investorUserId: string;
          username: string;
          displayName: string;
          sharedContacts: string | null;
        }>()
    : null;
  const founderSharedContacts =
    user &&
    ownInterest?.founderSharesContact &&
    user.id !== project.founderUserId
      ? await db
          .prepare(
            `SELECT contact_type AS contactType, contact_value AS contactValue
             FROM profile_contacts
             WHERE user_id = ? AND visibility IN (
               'project_interests',
               'connections_and_project_interests'
             )
             ORDER BY contact_type`,
          )
          .bind(project.founderUserId)
          .all<{ contactType: string; contactValue: string }>()
      : null;
  const campaigns = await db
    .prepare(
      `SELECT slug, title, summary, status
       FROM ambassador_campaigns
       WHERE project_id = ?
         AND (status = 'published' OR created_by = ? OR ? = 1)
       ORDER BY updated_at DESC`,
    )
    .bind(project.id, user?.id ?? "", canManage ? 1 : 0)
    .all<{ slug: string; title: string; summary: string; status: string }>();
  const [socials, team] = await Promise.all([
    db
      .prepare(
        "SELECT platform, url FROM project_social_links WHERE project_id = ? ORDER BY platform",
      )
      .bind(project.id)
      .all<{ platform: string; url: string }>(),
    db
      .prepare(
        `SELECT ptm.display_name AS displayName, ptm.team_role AS teamRole,
                ptm.social_url AS socialUrl, u.username AS linkedUsername
         FROM project_team_members ptm
         LEFT JOIN users u ON u.id = ptm.linked_user_id
         LEFT JOIN profiles linked_profile ON linked_profile.user_id = u.id
         LEFT JOIN profile_visibility pv ON pv.user_id = u.id
         LEFT JOIN membership_applications ma
           ON ma.user_id = u.id AND ma.status = 'approved'
         WHERE ptm.project_id = ?
           AND (
             ptm.linked_user_id IS NULL OR (
               u.status = 'active' AND ma.user_id IS NOT NULL
               AND COALESCE(pv.visibility, linked_profile.visibility) = 'public'
             )
           )
         ORDER BY ptm.created_at`,
      )
      .bind(project.id)
      .all<{
        displayName: string;
        teamRole: string;
        socialUrl: string;
        linkedUsername: string | null;
      }>(),
  ]);
  const verifiedRelationships = await db
    .prepare(
      `SELECT rel.relationship_type AS relationshipType,
              u.username, p.display_name AS displayName
       FROM project_relationships rel
       JOIN users u ON u.id = rel.user_id
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN profile_visibility pv ON pv.user_id = u.id
       JOIN membership_applications ma
         ON ma.user_id = u.id AND ma.status = 'approved'
       WHERE rel.project_id = ?
         AND rel.claim_status = 'verified'
         AND u.status = 'active'
         AND COALESCE(pv.visibility, p.visibility) = 'public'
       ORDER BY CASE rel.relationship_type
         WHEN 'founder' THEN 1
         WHEN 'cofounder' THEN 2
         WHEN 'authorized_representative' THEN 3
         WHEN 'team_member' THEN 4
         ELSE 5 END, p.display_name`,
    )
    .bind(project.id)
    .all<{
      relationshipType: string;
      username: string;
      displayName: string;
    }>();

  return {
    user,
    project,
    following,
    ownInterest,
    interests: interests?.results ?? [],
    founderSharedContacts: founderSharedContacts?.results ?? [],
    campaigns: campaigns.results,
    socials: socials.results,
    team: team.results,
    verifiedRelationships: verifiedRelationships.results,
    verifiedInvestor: await isVerifiedInvestor(db, user),
    canManage,
    submitted: new URL(request.url).searchParams.has("submitted"),
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const project = await db
    .prepare(
      `SELECT id, founder_user_id AS founderUserId, title, status, seeking,
              support_status_json AS supportStatus
       FROM projects WHERE slug = ?`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      founderUserId: string;
      title: string;
      status: string;
      seeking: string;
      supportStatus: string;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  const canManage = await userCanManageProject(db, project.id, user.id);
  if (project.status !== "published" && !canManage)
    throw new Response("Project not found.", { status: 404 });
  const fundraisingClosed =
    projectHasNeed(project.seeking, "fundraising") &&
    !projectHasOpenNeed(project.seeking, project.supportStatus, "fundraising");
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  await requireActionRateLimit(
    db,
    request,
    "project-engagement",
    user.id,
    40,
    60,
  );

  if (intent === "follow" || intent === "unfollow") {
    if (!user.roles.includes("creator"))
      throw new Response("Creator role required.", { status: 403 });
    if (intent === "follow")
      await db
        .prepare(
          "INSERT OR IGNORE INTO project_follows (project_id, user_id) VALUES (?, ?)",
        )
        .bind(project.id, user.id)
        .run();
    else
      await db
        .prepare(
          "DELETE FROM project_follows WHERE project_id = ? AND user_id = ?",
        )
        .bind(project.id, user.id)
        .run();
    throw redirect(`/projects/${params.slug}`);
  }

  if (intent === "interest") {
    if (fundraisingClosed)
      return {
        error:
          "This Founder has marked fundraising as paused, completed or no longer open.",
      };
    if (!(await isVerifiedInvestor(db, user)))
      throw new Response("Verified Investor access required.", { status: 403 });
    if (canManage)
      throw new Response("You cannot invest in your own project here.", {
        status: 400,
      });
    const message = formText(form.get("message")).trim();
    const shareContact = form.get("shareContact") === "yes" ? 1 : 0;
    if (message.length < 10 || message.length > 800)
      return { error: "Add an interest note between 10 and 800 characters." };
    await db.batch([
      db
        .prepare(
          `INSERT INTO project_interests
           (id, project_id, investor_user_id, message,
            investor_shares_contact, status, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))
           ON CONFLICT(project_id, investor_user_id) DO UPDATE SET
             message = excluded.message,
             investor_shares_contact = excluded.investor_shares_contact,
             status = 'active', updated_at = excluded.updated_at`,
        )
        .bind(crypto.randomUUID(), project.id, user.id, message, shareContact),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'project.interest', 'New investor interest', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          project.founderUserId,
          `${user.displayName} expressed interest in ${project.title}.`,
          `/projects/${params.slug}`,
        ),
    ]);
    throw redirect(`/projects/${params.slug}?interest=saved`);
  }

  if (intent === "withdraw-interest") {
    await db
      .prepare(
        `UPDATE project_interests SET status = 'withdrawn',
         updated_at = datetime('now')
         WHERE project_id = ? AND investor_user_id = ?`,
      )
      .bind(project.id, user.id)
      .run();
    throw redirect(`/projects/${params.slug}`);
  }

  if (intent === "share-founder-contact") {
    if (user.accessTier !== "member")
      throw new Response("Approved membership is required.", { status: 403 });
    if (!canManage)
      throw new Response("Project owner or collaborator required.", {
        status: 403,
      });
    const interestId = formText(form.get("interestId"));
    const interest = await db
      .prepare(
        `SELECT investor_user_id AS investorUserId
         FROM project_interests WHERE id = ? AND project_id = ?`,
      )
      .bind(interestId, project.id)
      .first<{ investorUserId: string }>();
    if (!interest) throw new Response("Interest not found.", { status: 404 });
    await db.batch([
      db
        .prepare(
          `UPDATE project_interests SET founder_shares_contact = 1,
           status = 'contacted', updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(interestId),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'project.contact_shared', 'Founder shared contact access',
                   ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          interest.investorUserId,
          `The founder of ${project.title} opened their project contact details.`,
          `/projects/${params.slug}`,
        ),
    ]);
    throw redirect(`/projects/${params.slug}`);
  }

  throw new Response("Unsupported action.", { status: 400 });
}

export default function ProjectDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { project, user } = loaderData;
  const navigation = useNavigation();
  const isFounder = loaderData.canManage;
  const fundraisingClosed =
    projectHasNeed(project.seeking, "fundraising") &&
    !projectHasOpenNeed(project.seeking, project.supportStatus, "fundraising");
  return (
    <div className="site-shell">
      <SiteHeader user={user} />
      <main id="main-content" className="project-detail-main">
        {loaderData.submitted && (
          <p className="notice success">
            Project submitted. It stays private until the AKARI team publishes
            it.
          </p>
        )}
        <span className="chapter">
          {project.stage.replace("_", " ")} · {project.status}
        </span>
        <h1>{project.title}</h1>
        <p className="project-lede">{project.summary}</p>
        <p className="project-story">{project.description}</p>
        {project.seeking && (
          <aside className="project-seeking-panel">
            <strong>Support status</strong>
            <div className="project-support-groups">
              <div>
                <span className="eyebrow">Open</span>
                <ProjectNeedChips
                  value={project.seeking}
                  statusValue={project.supportStatus}
                  mode="open"
                />
              </div>
              <div>
                <span className="eyebrow">Progress</span>
                <ProjectNeedChips
                  value={project.seeking}
                  statusValue={project.supportStatus}
                  mode="closed"
                />
              </div>
            </div>
          </aside>
        )}
        <p>
          Founded by{" "}
          <Link to={`/profiles/${project.founderUsername}`}>
            {project.founderName}
          </Link>
        </p>
        {loaderData.verifiedRelationships.length > 0 && (
          <section
            className="project-action-panel"
            aria-label="Verified project relationships"
          >
            <span className="eyebrow">AKARI verified</span>
            <h2>Verified project relationships</h2>
            <p>
              AKARI has reviewed evidence supporting these professional
              relationships with this project.
            </p>
            {loaderData.verifiedRelationships.map((relationship) => (
              <article
                key={`${relationship.username}:${relationship.relationshipType}`}
              >
                <h3>
                  <Link to={`/profiles/${relationship.username}`}>
                    {relationship.displayName}
                  </Link>{" "}
                  <span className="chapter">✓ Verified by AKARI</span>
                </h3>
                <p>{projectRelationshipLabel(relationship.relationshipType)}</p>
              </article>
            ))}
          </section>
        )}
        {loaderData.socials.length > 0 && (
          <nav className="profile-socials" aria-label="Project links">
            {loaderData.socials.map((social) => (
              <a
                href={social.url}
                key={social.platform}
                rel="noreferrer"
                target="_blank"
              >
                {social.platform}
              </a>
            ))}
          </nav>
        )}
        {loaderData.team.length > 0 && (
          <section className="project-action-panel">
            <span className="eyebrow">Team</span>
            <h2>People behind the project</h2>
            {loaderData.team.map((member) => (
              <article key={`${member.displayName}:${member.teamRole}`}>
                <h3>
                  {member.linkedUsername ? (
                    <Link to={`/profiles/${member.linkedUsername}`}>
                      {member.displayName}
                    </Link>
                  ) : (
                    member.displayName
                  )}
                </h3>
                <p>{member.teamRole}</p>
                {!member.linkedUsername && member.socialUrl && (
                  <a href={member.socialUrl} rel="noreferrer" target="_blank">
                    Public profile
                  </a>
                )}
              </article>
            ))}
          </section>
        )}
        {isFounder && project.status === "published" && (
          <Link
            className="button button-primary"
            to={`/projects/${project.slug}/campaigns/new`}
          >
            Propose an Ambassador campaign
          </Link>
        )}
        {loaderData.campaigns.length > 0 && (
          <section className="project-action-panel">
            <span className="eyebrow">Ambassador campaigns</span>
            <h2>Creator opportunities</h2>
            {loaderData.campaigns.map((campaign) => (
              <article key={campaign.slug}>
                <span className="chapter">{campaign.status}</span>
                <h3>
                  <Link to={`/campaigns/${campaign.slug}`}>
                    {campaign.title}
                  </Link>
                </h3>
                <p>{campaign.summary}</p>
              </article>
            ))}
          </section>
        )}

        {user?.roles.includes("creator") && !isFounder && (
          <Form method="post">
            <button
              className="button button-quiet"
              name="intent"
              value={loaderData.following ? "unfollow" : "follow"}
            >
              {loaderData.following ? "Following project" : "Follow project"}
            </button>
          </Form>
        )}

        {user?.roles.includes("investor") && !isFounder && (
          <section className="project-action-panel">
            <h2>Express investment interest</h2>
            {fundraisingClosed ? (
              <p className="notice">
                Fundraising is not currently open. The Founder-reported outcome
                remains visible above for context.
              </p>
            ) : (
              <>
                {!loaderData.verifiedInvestor && (
                  <p className="notice">
                    Admin verification is required before an Investor can send
                    an interest request.
                  </p>
                )}
                {actionData?.error && (
                  <p className="form-error" role="alert">
                    {actionData.error}
                  </p>
                )}
                <Form method="post" className="form-stack">
                  <label>
                    Why would a conversation be useful?
                    <textarea
                      name="message"
                      minLength={10}
                      maxLength={800}
                      rows={4}
                      required
                    />
                  </label>
                  <label className="inline-choice">
                    <input type="checkbox" name="shareContact" value="yes" />
                    Allow the founder to see contact methods I marked for
                    project interests
                  </label>
                  <button
                    className="button button-primary"
                    name="intent"
                    value="interest"
                    disabled={
                      navigation.state !== "idle" ||
                      !loaderData.verifiedInvestor
                    }
                  >
                    {loaderData.ownInterest
                      ? "Update my interest"
                      : "Show interest"}
                  </button>
                  {loaderData.ownInterest?.status !== "withdrawn" && (
                    <button
                      className="text-button"
                      name="intent"
                      value="withdraw-interest"
                    >
                      Withdraw interest
                    </button>
                  )}
                </Form>
              </>
            )}
          </section>
        )}
        {loaderData.founderSharedContacts.length > 0 && (
          <section className="project-action-panel">
            <h2>Founder contact details</h2>
            <p>
              The founder explicitly shared these details for this project
              conversation.
            </p>
            <dl className="profile-contacts">
              {loaderData.founderSharedContacts.map((contact) => (
                <div key={contact.contactType}>
                  <dt>{contact.contactType}</dt>
                  <dd>{contact.contactValue}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {isFounder && (
          <section className="project-interest-list">
            <span className="eyebrow">Investor interest</span>
            <h2>People who raised their hand.</h2>
            {loaderData.interests.length ? (
              loaderData.interests.map((interest) => (
                <article key={interest.id}>
                  <h3>
                    <Link to={`/profiles/${interest.username}`}>
                      {interest.displayName}
                    </Link>
                  </h3>
                  <p>{interest.message}</p>
                  {interest.sharedContacts && (
                    <ul>
                      {interest.sharedContacts.split("||").map((contact) => (
                        <li key={contact}>{contact.replace(":", ": ")}</li>
                      ))}
                    </ul>
                  )}
                  {!interest.investorSharesContact && (
                    <small>
                      This investor has not shared private contact details.
                    </small>
                  )}
                  {!interest.founderSharesContact && (
                    <Form method="post">
                      <input
                        type="hidden"
                        name="interestId"
                        value={interest.id}
                      />
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="share-founder-contact"
                      >
                        Share my project contact details
                      </button>
                    </Form>
                  )}
                </article>
              ))
            ) : (
              <p>No investor interest yet.</p>
            )}
          </section>
        )}
        {user && !isFounder && (
          <Link
            className="quiet-link"
            to={`/report?subjectType=project&subjectId=${encodeURIComponent(project.id)}&returnTo=${encodeURIComponent(`/projects/${project.slug}`)}`}
          >
            Report project
          </Link>
        )}
      </main>
    </div>
  );
}
