import { Link } from "react-router";
import type { Route } from "./+types/admin-seed-house";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import { buildProjectReadiness } from "~/lib/project-readiness";
import "~/styles/r96-pilot-readiness.css";

type CountRow = { count: number };

type SeedProjectRow = {
  slug: string;
  title: string;
  description: string;
  summary: string;
  seeking: string;
  status: string;
  logoKey: string | null;
  bannerKey: string | null;
  hasWebsite: number;
  socialCount: number;
  teamCount: number;
};

type CreatorRow = {
  username: string;
  displayName: string;
  hasXProfile: number;
  hasFollowerCount: number;
  hasXScore: number;
  hasSorsaScore: number;
};

async function scalar(db: D1Database, sql: string) {
  const row = await db.prepare(sql).first<CountRow>();
  return Number(row?.count ?? 0);
}

export const meta: Route.MetaFunction = () => [
  { title: "Seed the House | AKARI House" },
  {
    name: "description",
    content:
      "Private launch inventory and pilot seeding readiness for AKARI House.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);

  const [
    approvedMembers,
    pendingMemberships,
    founders,
    creators,
    investors,
    publishedCampaigns,
    publishedOpportunities,
    upcomingEvents,
    projectRows,
    creatorRows,
  ] = await Promise.all([
    scalar(
      db,
      `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       JOIN membership_applications ma ON ma.user_id = u.id
       WHERE ma.status = 'approved' AND u.status = 'active'`,
    ),
    scalar(
      db,
      `SELECT COUNT(*) AS count FROM membership_applications
       WHERE status = 'pending'`,
    ),
    scalar(
      db,
      `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved'
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'founder'
       WHERE u.status = 'active'`,
    ),
    scalar(
      db,
      `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved'
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'creator'
       WHERE u.status = 'active'`,
    ),
    scalar(
      db,
      `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved'
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'investor'
       WHERE u.status = 'active'`,
    ),
    scalar(
      db,
      `SELECT COUNT(*) AS count FROM ambassador_campaigns
       WHERE status = 'published'`,
    ),
    scalar(
      db,
      `SELECT COUNT(*) AS count FROM opportunity_listings
       WHERE status = 'published'`,
    ),
    scalar(
      db,
      `SELECT COUNT(*) AS count FROM events
       WHERE status = 'published' AND starts_at >= datetime('now')`,
    ),
    db
      .prepare(
        `SELECT pr.slug, pr.title, pr.description, pr.summary, pr.seeking,
                pr.status, pr.logo_key AS logoKey, pr.banner_key AS bannerKey,
                EXISTS(
                  SELECT 1 FROM project_social_links psl
                  WHERE psl.project_id = pr.id AND psl.platform = 'website'
                ) AS hasWebsite,
                (
                  SELECT COUNT(*) FROM project_social_links psl
                  WHERE psl.project_id = pr.id AND psl.platform <> 'website'
                ) AS socialCount,
                (
                  SELECT COUNT(*) FROM project_team_members ptm
                  WHERE ptm.project_id = pr.id
                ) AS teamCount
         FROM projects pr
         WHERE pr.status IN ('draft', 'submitted', 'published')
         ORDER BY CASE pr.status WHEN 'published' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END,
                  pr.updated_at DESC`,
      )
      .all<SeedProjectRow>(),
    db
      .prepare(
        `SELECT u.username, p.display_name AS displayName,
                EXISTS(
                  SELECT 1 FROM profile_social_accounts x
                  WHERE x.user_id = u.id AND x.platform = 'x'
                    AND COALESCE(x.profile_url, '') <> ''
                ) AS hasXProfile,
                EXISTS(
                  SELECT 1 FROM profile_social_accounts x
                  WHERE x.user_id = u.id AND x.platform = 'x'
                    AND x.follower_count IS NOT NULL
                ) AS hasFollowerCount,
                EXISTS(
                  SELECT 1 FROM profile_reputation_signals r
                  WHERE r.user_id = u.id AND r.x_score IS NOT NULL
                ) AS hasXScore,
                EXISTS(
                  SELECT 1 FROM profile_reputation_signals r
                  WHERE r.user_id = u.id AND r.sorsa_score IS NOT NULL
                ) AS hasSorsaScore
         FROM users u
         JOIN profiles p ON p.user_id = u.id
         JOIN membership_applications ma
           ON ma.user_id = u.id AND ma.status = 'approved'
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'creator'
         WHERE u.status = 'active'
         ORDER BY p.display_name`,
      )
      .all<CreatorRow>(),
  ]);

  const projects = projectRows.results.map((project) => ({
    ...project,
    readiness: buildProjectReadiness({
      slug: project.slug,
      title: project.title,
      summary: project.summary,
      description: project.description,
      seeking: project.seeking,
      logoKey: project.logoKey,
      bannerKey: project.bannerKey,
      hasWebsite: Boolean(project.hasWebsite),
      socialCount: Number(project.socialCount),
    }),
  }));

  const publishedProjects = projects.filter(
    (project) => project.status === "published",
  );
  const discoveryReadyProjects = publishedProjects.filter(
    (project) => project.readiness.score === 100,
  );
  const creatorsReady = creatorRows.results.filter(
    (creator) =>
      creator.hasXProfile &&
      creator.hasFollowerCount &&
      creator.hasXScore &&
      creator.hasSorsaScore,
  ).length;

  const criteria = [
    {
      label: "At least 3 approved Founders",
      complete: founders >= 3,
      value: `${founders}/3`,
    },
    {
      label: "At least 8 approved Creators",
      complete: creators >= 8,
      value: `${creators}/8`,
    },
    {
      label: "At least 3 approved Investors",
      complete: investors >= 3,
      value: `${investors}/3`,
    },
    {
      label: "3 discovery-ready published Projects",
      complete: discoveryReadyProjects.length >= 3,
      value: `${discoveryReadyProjects.length}/3`,
    },
    {
      label: "1 live Ambassador Campaign",
      complete: publishedCampaigns >= 1,
      value: `${publishedCampaigns}/1`,
    },
    {
      label: "2 live Investor opportunities",
      complete: publishedOpportunities >= 2,
      value: `${publishedOpportunities}/2`,
    },
    {
      label: "2 upcoming Events",
      complete: upcomingEvents >= 2,
      value: `${upcomingEvents}/2`,
    },
    {
      label: "5 campaign-ready Creators",
      complete: creatorsReady >= 5,
      value: `${creatorsReady}/5`,
    },
  ];

  const completedCriteria = criteria.filter((item) => item.complete).length;
  const pilotReadiness = Math.round(
    (completedCriteria / criteria.length) * 100,
  );

  return {
    user,
    access,
    summary: {
      approvedMembers,
      pendingMemberships,
      founders,
      creators,
      investors,
      publishedCampaigns,
      publishedOpportunities,
      upcomingEvents,
      publishedProjects: publishedProjects.length,
      discoveryReadyProjects: discoveryReadyProjects.length,
      creatorsReady,
    },
    criteria,
    pilotReadiness,
    projects,
    creators: creatorRows.results,
  };
}

export default function AdminSeedHouse({ loaderData }: Route.ComponentProps) {
  const projectGaps = loaderData.projects
    .filter((project) => project.readiness.score < 100 || project.teamCount < 1)
    .slice(0, 12);
  const creatorGaps = loaderData.creators
    .filter(
      (creator) =>
        !creator.hasXProfile ||
        !creator.hasFollowerCount ||
        !creator.hasXScore ||
        !creator.hasSorsaScore,
    )
    .slice(0, 12);

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <AdminWorkspaceNav access={loaderData.access} />
      <main id="main-content" className="seed-house-main">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Superadmin · pilot operations</span>
            <h1>Seed the House.</h1>
            <p>
              One operational view of whether real people, projects, campaigns,
              opportunities and events are ready for the controlled AKARI pilot.
            </p>
          </div>
          <div className="button-row">
            <Link className="button button-quiet" to="/admin/launch-completion">
              Pilot execution
            </Link>
            <Link className="button button-quiet" to="/admin/reviews">
              Review inbox
            </Link>
          </div>
        </header>

        <section className="seed-house-panel seed-house-readiness">
          <div>
            <span className="eyebrow">Controlled pilot readiness</span>
            <h2>Is there enough real activity to invite people in?</h2>
            <p>
              This score measures seed inventory only. It does not override the
              Launch Gate, security evidence or admin approval requirements.
            </p>
          </div>
          <div className="seed-house-readiness-score">
            {loaderData.pilotReadiness}%
          </div>
        </section>

        <div className="seed-house-summary">
          <article className="seed-house-stat">
            <span className="eyebrow">Approved members</span>
            <strong>{loaderData.summary.approvedMembers}</strong>
            <small>{loaderData.summary.pendingMemberships} pending</small>
          </article>
          <article className="seed-house-stat">
            <span className="eyebrow">Ready projects</span>
            <strong>{loaderData.summary.discoveryReadyProjects}</strong>
            <small>{loaderData.summary.publishedProjects} published</small>
          </article>
          <article className="seed-house-stat">
            <span className="eyebrow">Campaign-ready creators</span>
            <strong>{loaderData.summary.creatorsReady}</strong>
            <small>{loaderData.summary.creators} approved Creators</small>
          </article>
          <article className="seed-house-stat">
            <span className="eyebrow">Live opportunities</span>
            <strong>{loaderData.summary.publishedOpportunities}</strong>
            <small>{loaderData.summary.upcomingEvents} upcoming events</small>
          </article>
        </div>

        <div className="seed-house-grid">
          <section className="seed-house-panel">
            <span className="eyebrow">Pilot inventory</span>
            <h2>Minimum seed checklist</h2>
            <ul className="seed-house-gap-list">
              {loaderData.criteria.map((criterion) => (
                <li key={criterion.label}>
                  <span>
                    {criterion.complete ? "✓" : "○"} {criterion.label}
                  </span>
                  <span className="seed-house-badge">{criterion.value}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="seed-house-panel">
            <span className="eyebrow">Role mix</span>
            <h2>Who is already in the House?</h2>
            <ul className="seed-house-gap-list">
              <li>
                <span>Founders</span>
                <span className="seed-house-badge">
                  {loaderData.summary.founders}
                </span>
              </li>
              <li>
                <span>Creators</span>
                <span className="seed-house-badge">
                  {loaderData.summary.creators}
                </span>
              </li>
              <li>
                <span>Investors</span>
                <span className="seed-house-badge">
                  {loaderData.summary.investors}
                </span>
              </li>
              <li>
                <span>Live campaigns</span>
                <span className="seed-house-badge">
                  {loaderData.summary.publishedCampaigns}
                </span>
              </li>
            </ul>
          </section>

          <section className="seed-house-panel">
            <span className="eyebrow">Project gaps</span>
            <h2>Projects that still need attention</h2>
            {projectGaps.length ? (
              <ul className="seed-house-project-list">
                {projectGaps.map((project) => (
                  <li key={project.slug}>
                    <span>
                      <Link to={`/projects/${project.slug}`}>
                        {project.title}
                      </Link>
                      <br />
                      <small>
                        {project.readiness.nextAction?.label ??
                          (project.teamCount < 1
                            ? "Add the project team"
                            : "Review project")}
                      </small>
                    </span>
                    <span className="seed-house-badge">
                      {project.readiness.score}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Every active project currently meets the discovery checklist.
              </p>
            )}
            <Link className="quiet-link" to="/admin/interests">
              Open project review tools
            </Link>
          </section>

          <section className="seed-house-panel">
            <span className="eyebrow">Creator eligibility gaps</span>
            <h2>Creators not yet campaign-ready</h2>
            {creatorGaps.length ? (
              <ul className="seed-house-project-list">
                {creatorGaps.map((creator) => {
                  const missing = [
                    !creator.hasXProfile && "X profile",
                    !creator.hasFollowerCount && "followers",
                    !creator.hasXScore && "Xscore",
                    !creator.hasSorsaScore && "Sorsa",
                  ].filter(Boolean);
                  return (
                    <li key={creator.username}>
                      <span>
                        <Link to={`/profiles/${creator.username}`}>
                          {creator.displayName}
                        </Link>
                        <br />
                        <small>Missing: {missing.join(", ")}</small>
                      </span>
                      <span className="seed-house-badge">Needs update</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>
                All approved Creators meet campaign eligibility data
                requirements.
              </p>
            )}
            <Link className="quiet-link" to="/members?role=creator">
              Open Creator directory
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
