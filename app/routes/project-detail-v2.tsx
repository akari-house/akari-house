import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/project-detail-v2";
import { ProjectNeedChips } from "~/components/projects/ProjectNeedChips";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { projectHasOpenNeed } from "~/lib/project-need-status";
import { projectHasNeed } from "~/lib/project-needs";
import { projectRelationshipLabel } from "~/lib/project-relationships";
import {
  action as projectAction,
  loader as projectLoader,
} from "./project-detail";
import "~/styles/r96-pilot-readiness.css";

export async function loader(args: Route.LoaderArgs) {
  const base = await projectLoader(args);
  const db = args.context.get(cloudflareContext).env.DB;
  const brand = await db
    .prepare(
      `SELECT logo_key AS logoKey, banner_key AS bannerKey
       FROM projects WHERE slug = ?`,
    )
    .bind(args.params.slug)
    .first<{ logoKey: string | null; bannerKey: string | null }>();

  return {
    ...base,
    brand: brand ?? { logoKey: null, bannerKey: null },
  };
}

export async function action(args: Route.ActionArgs) {
  return projectAction(args);
}

function platformLabel(platform: string) {
  if (platform === "x") return "X";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export default function ProjectDetailV2({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { project, user, brand } = loaderData;
  const navigation = useNavigation();
  const isFounder = loaderData.canManage;
  const isCreator = Boolean(user?.roles.includes("creator"));
  const isInvestor = Boolean(user?.roles.includes("investor"));
  const fundraisingClosed =
    projectHasNeed(project.seeking, "fundraising") &&
    !projectHasOpenNeed(project.seeking, project.supportStatus, "fundraising");

  return (
    <div className="site-shell">
      <SiteHeader user={user} />
      <main id="main-content" className="project-detail-v2">
        {loaderData.submitted && (
          <p className="notice success">
            Project submitted. It stays private until the AKARI team publishes
            it.
          </p>
        )}

        <header className="project-detail-hero">
          {brand.bannerKey ? (
            <img
              className="project-detail-banner"
              src={`/media/projects/${project.slug}/banner`}
              alt={`${project.title} banner`}
            />
          ) : (
            <div
              className="project-detail-banner-fallback"
              aria-hidden="true"
            />
          )}

          <div className="project-detail-hero-body">
            <div className="project-detail-identity">
              {brand.logoKey ? (
                <img
                  className="project-detail-logo"
                  src={`/media/projects/${project.slug}/logo`}
                  alt={`${project.title} logo`}
                />
              ) : (
                <div
                  className="project-detail-logo-fallback"
                  aria-hidden="true"
                >
                  {project.title.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <span className="chapter">
                  {project.stage.replaceAll("_", " ")} · {project.status}
                </span>
                <h1>{project.title}</h1>
                <p className="project-lede">{project.summary}</p>
                <p className="project-detail-founder">
                  Founded by{" "}
                  <Link to={`/profiles/${project.founderUsername}`}>
                    {project.founderName}
                  </Link>
                </p>
              </div>
            </div>

            <div
              className="project-detail-primary-actions"
              aria-label="Project actions"
            >
              {isFounder && (
                <>
                  <Link
                    className="button button-primary"
                    to={`/projects/${project.slug}/edit`}
                  >
                    Manage project
                  </Link>
                  <Link
                    className="button button-quiet"
                    to={`/projects/${project.slug}/needs`}
                  >
                    Update needs
                  </Link>
                  {project.status === "published" && (
                    <Link
                      className="button button-quiet"
                      to={`/projects/${project.slug}/campaigns/new`}
                    >
                      Launch campaign
                    </Link>
                  )}
                </>
              )}

              {isCreator && !isFounder && (
                <>
                  <Form method="post">
                    <button
                      className="button button-primary"
                      name="intent"
                      value={loaderData.following ? "unfollow" : "follow"}
                    >
                      {loaderData.following
                        ? "Following project"
                        : "Follow project"}
                    </button>
                  </Form>
                  {loaderData.campaigns.length > 0 && (
                    <a
                      className="button button-quiet"
                      href="#creator-opportunities"
                    >
                      View campaigns
                    </a>
                  )}
                </>
              )}

              {isInvestor && !isFounder && (
                <a className="button button-primary" href="#investor-interest">
                  {loaderData.ownInterest
                    ? "Update interest"
                    : "Express interest"}
                </a>
              )}

              {!user && (
                <Link className="button button-primary" to="/login">
                  Sign in to connect
                </Link>
              )}
            </div>
          </div>
        </header>

        <div className="project-detail-layout">
          <div className="project-detail-main-column">
            <section className="project-detail-section">
              <span className="eyebrow">Project story</span>
              <h2>What they are building</h2>
              <p className="project-detail-story">
                {project.description || project.summary}
              </p>
            </section>

            {loaderData.socials.length > 0 && (
              <section className="project-detail-section">
                <span className="eyebrow">Official channels</span>
                <h2>Project links</h2>
                <nav
                  className="project-detail-links"
                  aria-label="Project links"
                >
                  {loaderData.socials.map((social) => (
                    <a
                      href={social.url}
                      key={social.platform}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {platformLabel(social.platform)}
                    </a>
                  ))}
                </nav>
              </section>
            )}

            {loaderData.team.length > 0 && (
              <section className="project-detail-section">
                <span className="eyebrow">Team</span>
                <h2>People behind the work</h2>
                <div className="project-detail-team-list">
                  {loaderData.team.map((member) => (
                    <article
                      className="project-detail-team-card"
                      key={`${member.displayName}:${member.teamRole}`}
                    >
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
                        <a
                          href={member.socialUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Public profile
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {loaderData.verifiedRelationships.length > 0 && (
              <section
                className="project-detail-section"
                aria-label="Verified project relationships"
              >
                <span className="eyebrow">AKARI verified</span>
                <h2>Verified project relationships</h2>
                <p>
                  AKARI has reviewed evidence supporting these professional
                  relationships with this project.
                </p>
                <div className="project-detail-team-list">
                  {loaderData.verifiedRelationships.map((relationship) => (
                    <article
                      className="project-detail-team-card"
                      key={`${relationship.username}:${relationship.relationshipType}`}
                    >
                      <h3>
                        <Link to={`/profiles/${relationship.username}`}>
                          {relationship.displayName}
                        </Link>{" "}
                        <span className="chapter">✓ Verified by AKARI</span>
                      </h3>
                      <p>
                        {projectRelationshipLabel(
                          relationship.relationshipType,
                        )}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {loaderData.campaigns.length > 0 && (
              <section
                id="creator-opportunities"
                className="project-detail-section"
              >
                <span className="eyebrow">Ambassador campaigns</span>
                <h2>Creator opportunities</h2>
                <div className="project-detail-campaign-list">
                  {loaderData.campaigns.map((campaign) => (
                    <article
                      className="project-detail-campaign-card"
                      key={campaign.slug}
                    >
                      <span className="chapter">{campaign.status}</span>
                      <h3>
                        <Link to={`/campaigns/${campaign.slug}`}>
                          {campaign.title}
                        </Link>
                      </h3>
                      <p>{campaign.summary}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {isInvestor && !isFounder && (
              <section
                id="investor-interest"
                className="project-detail-section"
              >
                <span className="eyebrow">Investor conversation</span>
                <h2>Express investment interest</h2>
                {fundraisingClosed ? (
                  <p className="notice">
                    Fundraising is not currently open. The Founder-reported
                    outcome remains visible in the support section.
                  </p>
                ) : (
                  <>
                    {!loaderData.verifiedInvestor && (
                      <p className="notice">
                        Admin verification is required before an Investor can
                        send an interest request.
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
                        <input
                          type="checkbox"
                          name="shareContact"
                          value="yes"
                        />
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
              <section className="project-detail-section">
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
              <section className="project-detail-section">
                <span className="eyebrow">Investor interest</span>
                <h2>People who raised their hand</h2>
                <div className="project-detail-interest-list">
                  {loaderData.interests.length ? (
                    loaderData.interests.map((interest) => (
                      <article
                        className="project-detail-interest-card"
                        key={interest.id}
                      >
                        <h3>
                          <Link to={`/profiles/${interest.username}`}>
                            {interest.displayName}
                          </Link>
                        </h3>
                        <p>{interest.message}</p>
                        {interest.sharedContacts && (
                          <ul>
                            {interest.sharedContacts
                              .split("||")
                              .map((contact) => (
                                <li key={contact}>
                                  {contact.replace(":", ": ")}
                                </li>
                              ))}
                          </ul>
                        )}
                        {!interest.investorSharesContact && (
                          <small>
                            This investor has not shared private contact
                            details.
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
                </div>
              </section>
            )}
          </div>

          <aside className="project-detail-side-column">
            {project.seeking && (
              <section className="project-detail-section">
                <span className="eyebrow">What this project needs</span>
                <h2>Open support</h2>
                <div className="project-support-groups">
                  <div>
                    <ProjectNeedChips
                      value={project.seeking}
                      statusValue={project.supportStatus}
                      mode="open"
                    />
                  </div>
                  <div>
                    <span className="eyebrow">Progress / completed</span>
                    <ProjectNeedChips
                      value={project.seeking}
                      statusValue={project.supportStatus}
                      mode="closed"
                    />
                  </div>
                </div>
              </section>
            )}

            <section className="project-detail-section">
              <span className="eyebrow">Your next move</span>
              {isFounder ? (
                <>
                  <h2>Keep the project current</h2>
                  <p className="project-detail-role-note">
                    Update the project story, brand and support needs as the
                    company changes.
                  </p>
                  <div className="button-row">
                    <Link
                      className="button button-primary"
                      to="/projects/manage"
                    >
                      Founder project desk
                    </Link>
                  </div>
                </>
              ) : isCreator ? (
                <>
                  <h2>Follow the work</h2>
                  <p className="project-detail-role-note">
                    Follow the project and open any live campaign when there is
                    a creator opportunity that fits you.
                  </p>
                </>
              ) : isInvestor ? (
                <>
                  <h2>Start with context</h2>
                  <p className="project-detail-role-note">
                    Review the project story and current support needs before
                    opening an investment conversation.
                  </p>
                </>
              ) : (
                <>
                  <h2>Join the House</h2>
                  <p className="project-detail-role-note">
                    Sign in to follow projects, connect with Founders and access
                    role-specific collaboration flows.
                  </p>
                </>
              )}
            </section>

            {user && !isFounder && (
              <Link
                className="quiet-link"
                to={`/report?subjectType=project&subjectId=${encodeURIComponent(project.id)}&returnTo=${encodeURIComponent(`/projects/${project.slug}`)}`}
              >
                Report project
              </Link>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
