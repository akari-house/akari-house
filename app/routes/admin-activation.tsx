import { Link } from "react-router";
import type { Route } from "./+types/admin-activation";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";

type ReadinessCounts = {
  members: number;
  founders: number;
  founderActivated: number;
  creators: number;
  creatorReady: number;
  investors: number;
  investorReady: number;
};

type EventAggregate = {
  actionKey: string;
  eventType: "shown" | "clicked";
  eventCount: number;
  userCount: number;
};

type MilestoneAggregate = {
  milestoneKey: string;
  total: number;
};

const actionLabels: Record<string, string> = {
  "applicant-profile": "Applicant profile",
  "profile-readiness": "Professional profile",
  "founder-first-project": "Founder first Project",
  "founder-project-claim": "Project relationship claim",
  "founder-draft-project": "Founder draft Project",
  "founder-project-needs": "Project needs",
  "creator-readiness": "Creator campaign readiness",
  "creator-campaigns": "Ambassador Campaign discovery",
  "investor-preferences": "Investor preferences",
  "investor-verification": "Investor verification",
  "investor-review-pending": "Investor review pending",
  "investor-opportunities": "Investor opportunities",
  "pending-connections": "Connection requests",
  "unread-notifications": "House updates",
  "discover-members": "Member discovery",
  "applicant-projects": "Applicant Project discovery",
  "applicant-events": "Applicant event discovery",
};

function percent(completed: number, total: number) {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}

export const meta: Route.MetaFunction = () => [
  { title: "Activation Analytics | AKARI House" },
  {
    name: "description",
    content: "Private activation and role-readiness analytics for AKARI House.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);

  const [readiness, events, milestones, engagement] = await Promise.all([
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*)
             FROM membership_applications ma
             JOIN users u ON u.id = ma.user_id
            WHERE ma.status = 'approved' AND u.status = 'active') AS members,
          (SELECT COUNT(*)
             FROM user_roles ur
             JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'founder' AND u.status = 'active') AS founders,
          (SELECT COUNT(*)
             FROM user_roles ur
             JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'founder' AND u.status = 'active'
              AND (
                EXISTS (SELECT 1 FROM projects p WHERE p.founder_user_id = ur.user_id)
                OR EXISTS (SELECT 1 FROM project_collaborators pc WHERE pc.user_id = ur.user_id)
              )) AS founderActivated,
          (SELECT COUNT(*)
             FROM user_roles ur
             JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'creator' AND u.status = 'active') AS creators,
          (SELECT COUNT(*)
             FROM user_roles ur
             JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'creator' AND u.status = 'active'
              AND EXISTS (
                SELECT 1 FROM profile_social_accounts x
                 WHERE x.user_id = ur.user_id AND x.platform = 'x'
                   AND COALESCE(x.profile_url, '') <> ''
                   AND x.follower_count IS NOT NULL
              )
              AND EXISTS (
                SELECT 1 FROM profile_reputation_signals r
                 WHERE r.user_id = ur.user_id
                   AND r.x_score IS NOT NULL
                   AND r.sorsa_score IS NOT NULL
              )) AS creatorReady,
          (SELECT COUNT(*)
             FROM user_roles ur
             JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'investor' AND u.status = 'active') AS investors,
          (SELECT COUNT(*)
             FROM user_roles ur
             JOIN users u ON u.id = ur.user_id
             JOIN investor_profiles ip ON ip.user_id = ur.user_id
            WHERE ur.role = 'investor' AND u.status = 'active'
              AND COALESCE(ip.sectors_json, '[]') <> '[]'
              AND COALESCE(ip.stages_json, '[]') <> '[]'
              AND COALESCE(ip.geographies_json, '[]') <> '[]'
              AND ip.minimum_ticket IS NOT NULL
              AND ip.maximum_ticket IS NOT NULL) AS investorReady`,
      )
      .first<ReadinessCounts>(),
    db
      .prepare(
        `SELECT action_key AS actionKey, event_type AS eventType,
                COUNT(*) AS eventCount, COUNT(DISTINCT user_id) AS userCount
           FROM activation_action_events
          WHERE created_at >= datetime('now', '-30 days')
          GROUP BY action_key, event_type
          ORDER BY userCount DESC, eventCount DESC`,
      )
      .all<EventAggregate>(),
    db
      .prepare(
        `SELECT milestone_key AS milestoneKey, COUNT(*) AS total
           FROM activation_milestones
          GROUP BY milestone_key
          ORDER BY total DESC`,
      )
      .all<MilestoneAggregate>(),
    db
      .prepare(
        `SELECT
          COUNT(DISTINCT CASE WHEN event_type = 'shown' THEN user_id END) AS shownUsers,
          COUNT(DISTINCT CASE WHEN event_type = 'clicked' THEN user_id END) AS clickedUsers,
          COUNT(CASE WHEN event_type = 'shown' THEN 1 END) AS shownEvents,
          COUNT(CASE WHEN event_type = 'clicked' THEN 1 END) AS clickedEvents
         FROM activation_action_events
         WHERE created_at >= datetime('now', '-30 days')`,
      )
      .first<{
        shownUsers: number;
        clickedUsers: number;
        shownEvents: number;
        clickedEvents: number;
      }>(),
  ]);

  const safeReadiness: ReadinessCounts = readiness ?? {
    members: 0,
    founders: 0,
    founderActivated: 0,
    creators: 0,
    creatorReady: 0,
    investors: 0,
    investorReady: 0,
  };
  const safeEngagement = engagement ?? {
    shownUsers: 0,
    clickedUsers: 0,
    shownEvents: 0,
    clickedEvents: 0,
  };

  const actionMap = new Map<
    string,
    { shownUsers: number; clickedUsers: number; shownEvents: number; clickedEvents: number }
  >();
  for (const row of events.results) {
    const current = actionMap.get(row.actionKey) ?? {
      shownUsers: 0,
      clickedUsers: 0,
      shownEvents: 0,
      clickedEvents: 0,
    };
    if (row.eventType === "shown") {
      current.shownUsers = Number(row.userCount);
      current.shownEvents = Number(row.eventCount);
    } else {
      current.clickedUsers = Number(row.userCount);
      current.clickedEvents = Number(row.eventCount);
    }
    actionMap.set(row.actionKey, current);
  }

  const actions = [...actionMap.entries()]
    .map(([key, value]) => ({
      key,
      label: actionLabels[key] ?? key,
      ...value,
      clickRate: percent(value.clickedUsers, value.shownUsers),
    }))
    .sort((a, b) => b.shownUsers - a.shownUsers || b.clickedUsers - a.clickedUsers);

  return {
    user,
    access,
    readiness: safeReadiness,
    engagement: safeEngagement,
    actions,
    milestones: milestones.results,
    clickThroughRate: percent(
      Number(safeEngagement.clickedUsers),
      Number(safeEngagement.shownUsers),
    ),
  };
}

export default function AdminActivation({ loaderData }: Route.ComponentProps) {
  const { readiness, engagement } = loaderData;
  const readinessRows = [
    {
      label: "Founder activation",
      description: "Founders with at least one owned or collaborated Project.",
      completed: Number(readiness.founderActivated),
      total: Number(readiness.founders),
    },
    {
      label: "Creator campaign readiness",
      description:
        "Creators with X profile, follower count, XScore and Sorsa Score present. No follower threshold is applied.",
      completed: Number(readiness.creatorReady),
      total: Number(readiness.creators),
    },
    {
      label: "Investor preference readiness",
      description:
        "Investors with sectors, stages, geographies and ticket range completed.",
      completed: Number(readiness.investorReady),
      total: Number(readiness.investors),
    },
  ];

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main admin-workspace-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">R76G activation intelligence</span>
            <h1>Activation analytics</h1>
            <p>
              Measure whether AKARI is moving members from account creation into
              useful Founder, Creator and Investor actions. Analytics stores
              action identifiers and timestamps, not profile content.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin/reviews">
            Open review inbox
          </Link>
        </header>

        <AdminWorkspaceNav access={loaderData.access} />

        <section className="application-queue-summary" aria-label="Activation summary">
          <span>
            <strong>{Number(readiness.members)}</strong> active members
          </span>
          <span>
            <strong>{Number(engagement.shownUsers)}</strong> reached by next actions
          </span>
          <span>
            <strong>{Number(engagement.clickedUsers)}</strong> clicked a next action
          </span>
          <span>
            <strong>{loaderData.clickThroughRate}%</strong> member click-through
          </span>
        </section>

        <section className="status-card" aria-labelledby="activation-readiness-title">
          <span className="chapter">Current readiness</span>
          <h2 id="activation-readiness-title">Role activation health</h2>
          <p>
            These numbers come from current account state, so they include members
            who completed setup before R76G event tracking started.
          </p>
        </section>

        <section className="admin-overview-list" aria-label="Role activation readiness">
          {readinessRows.map((row) => (
            <div className="admin-overview-row" key={row.label}>
              <strong>{row.label}</strong>
              <p>{row.description}</p>
              <span className="chapter">
                {row.completed}/{row.total} ready
              </span>
              <span className="admin-overview-row-action">
                {percent(row.completed, row.total)}%
              </span>
            </div>
          ))}
        </section>

        <section className="status-card" aria-labelledby="activation-actions-title">
          <span className="chapter">Last 30 days</span>
          <h2 id="activation-actions-title">Next-action engagement</h2>
          <p>
            Shown events are de-duplicated per member and action for one hour.
            Clicks are recorded when a member chooses an R76F next-action card.
          </p>
        </section>

        <section className="admin-overview-list" aria-label="Activation action engagement">
          {loaderData.actions.length ? (
            loaderData.actions.map((action) => (
              <div className="admin-overview-row" key={action.key}>
                <strong>{action.label}</strong>
                <p>
                  {action.shownUsers} unique shown, {action.clickedUsers} unique clicked.
                  {" "}{action.shownEvents} impressions and {action.clickedEvents} clicks recorded.
                </p>
                <span className="chapter">{action.clickRate}% click-through</span>
                <span className="admin-overview-row-action">{action.key}</span>
              </div>
            ))
          ) : (
            <div className="status-card">
              <h2>No activation events recorded yet.</h2>
              <p>R76G starts collecting privacy-minimal activation events after deployment.</p>
            </div>
          )}
        </section>

        <section className="status-card" aria-labelledby="activation-milestones-title">
          <span className="chapter">Recorded since R76G</span>
          <h2 id="activation-milestones-title">Durable activation milestones</h2>
          <p>
            A milestone is stored once per member when AKARI observes the completed
            state. Historical readiness remains represented by the live counts above.
          </p>
          <div className="application-queue-summary">
            {loaderData.milestones.length ? (
              loaderData.milestones.map((milestone) => (
                <span key={milestone.milestoneKey}>
                  <strong>{Number(milestone.total)}</strong> {milestone.milestoneKey}
                </span>
              ))
            ) : (
              <span>No milestones recorded yet</span>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
