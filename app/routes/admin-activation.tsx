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

type OutcomeCounts = {
  founderTotal: number;
  founderProject: number;
  founderPublished: number;
  founderVerified: number;
  founderActivated: number;
  founderEngaged: number;
  creatorTotal: number;
  creatorReady: number;
  creatorApplied: number;
  creatorShortlisted: number;
  creatorAccepted: number;
  creatorDelivered: number;
  creatorApproved: number;
  creatorCompensated: number;
  investorTotal: number;
  investorReady: number;
  investorViewed: number;
  investorInterest: number;
  investorConnected: number;
  investorProgressed: number;
};

type RecentOutcomeCounts = {
  creatorApplications7d: number;
  creatorApplications30d: number;
  investorSignals7d: number;
  investorSignals30d: number;
  founderActivations7d: number;
  founderActivations30d: number;
};

type ReviewHealth = {
  total: number;
  overdue: number;
  dueSoon: number;
  waitingUser: number;
  avgActiveAgeHours: number;
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

type FunnelStage = {
  label: string;
  count: number;
  description: string;
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
  "creator-campaign-status": "Creator campaign status",
  "investor-preferences": "Investor preferences",
  "investor-verification": "Investor verification",
  "investor-review-pending": "Investor review pending",
  "investor-opportunities": "Investor opportunities",
  "investor-interest-status": "Investor relationship status",
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

function largestDropoff(stages: FunnelStage[]) {
  let result: { from: string; to: string; count: number } | null = null;
  for (let index = 1; index < stages.length; index += 1) {
    const previous = stages[index - 1];
    const current = stages[index];
    const drop = Math.max(0, previous.count - current.count);
    if (!result || drop > result.count)
      result = { from: previous.label, to: current.label, count: drop };
  }
  return result;
}

export const meta: Route.MetaFunction = () => [
  { title: "Outcome Intelligence | AKARI House" },
  {
    name: "description",
    content:
      "Private activation, role-outcome and operations intelligence for AKARI House.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);

  const [
    readiness,
    events,
    milestones,
    engagement,
    outcomes,
    recentOutcomes,
    reviewHealth,
  ] = await Promise.all([
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
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'founder' AND u.status = 'active') AS founderTotal,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'founder' AND u.status = 'active'
              AND (EXISTS (SELECT 1 FROM projects p WHERE p.founder_user_id = ur.user_id)
                OR EXISTS (SELECT 1 FROM project_collaborators pc WHERE pc.user_id = ur.user_id))) AS founderProject,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'founder' AND u.status = 'active'
              AND EXISTS (
                SELECT 1 FROM projects p
                LEFT JOIN project_collaborators pc ON pc.project_id = p.id AND pc.user_id = ur.user_id
                WHERE (p.founder_user_id = ur.user_id OR pc.user_id = ur.user_id)
                  AND p.status = 'published')) AS founderPublished,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'founder' AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM project_relationships rel
                WHERE rel.user_id = ur.user_id AND rel.claim_status = 'verified'
                  AND rel.relationship_type IN ('founder','cofounder','authorized_representative'))) AS founderVerified,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'founder' AND u.status = 'active'
              AND EXISTS (
                SELECT 1 FROM projects p
                LEFT JOIN project_collaborators pc ON pc.project_id = p.id AND pc.user_id = ur.user_id
                WHERE (p.founder_user_id = ur.user_id OR pc.user_id = ur.user_id)
                  AND (
                    EXISTS (SELECT 1 FROM ambassador_campaigns ac WHERE ac.project_id = p.id AND ac.status IN ('submitted','published','closed'))
                    OR EXISTS (SELECT 1 FROM opportunity_listings ol WHERE ol.project_id = p.id AND ol.status IN ('submitted','published','closed'))
                  ))) AS founderActivated,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'founder' AND u.status = 'active'
              AND EXISTS (
                SELECT 1 FROM projects p
                LEFT JOIN project_collaborators pc ON pc.project_id = p.id AND pc.user_id = ur.user_id
                WHERE (p.founder_user_id = ur.user_id OR pc.user_id = ur.user_id)
                  AND (
                    EXISTS (SELECT 1 FROM project_interests pi WHERE pi.project_id = p.id AND pi.status <> 'withdrawn')
                    OR EXISTS (SELECT 1 FROM introduction_requests ir WHERE ir.project_id = p.id AND ir.status NOT IN ('withdrawn','declined'))
                    OR EXISTS (SELECT 1 FROM ambassador_campaigns ac JOIN campaign_applications ca ON ca.campaign_id = ac.id WHERE ac.project_id = p.id AND ca.status <> 'withdrawn')
                  ))) AS founderEngaged,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'creator' AND u.status = 'active') AS creatorTotal,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'creator' AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM profile_social_accounts x WHERE x.user_id = ur.user_id AND x.platform = 'x' AND COALESCE(x.profile_url, '') <> '' AND x.follower_count IS NOT NULL)
              AND EXISTS (SELECT 1 FROM profile_reputation_signals r WHERE r.user_id = ur.user_id AND r.x_score IS NOT NULL AND r.sorsa_score IS NOT NULL)) AS creatorReady,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'creator' AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM campaign_applications ca WHERE ca.creator_user_id = ur.user_id)) AS creatorApplied,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'creator' AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM campaign_applications ca WHERE ca.creator_user_id = ur.user_id AND ca.status IN ('shortlisted','accepted'))) AS creatorShortlisted,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'creator' AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM campaign_applications ca WHERE ca.creator_user_id = ur.user_id AND ca.status = 'accepted')) AS creatorAccepted,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'creator' AND u.status = 'active'
              AND (EXISTS (SELECT 1 FROM campaign_work_submissions cws WHERE cws.creator_user_id = ur.user_id)
                OR EXISTS (SELECT 1 FROM campaign_content_items cci WHERE cci.creator_user_id = ur.user_id))) AS creatorDelivered,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'creator' AND u.status = 'active'
              AND (EXISTS (SELECT 1 FROM campaign_work_submissions cws WHERE cws.creator_user_id = ur.user_id AND cws.status = 'approved')
                OR EXISTS (SELECT 1 FROM campaign_content_items cci WHERE cci.creator_user_id = ur.user_id AND cci.status = 'approved'))) AS creatorApproved,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'creator' AND u.status = 'active'
              AND (EXISTS (SELECT 1 FROM campaign_applications ca WHERE ca.creator_user_id = ur.user_id AND ca.status = 'accepted' AND ca.payout_cents > 0)
                OR EXISTS (SELECT 1 FROM campaign_creator_bonuses cb WHERE cb.creator_user_id = ur.user_id AND cb.status = 'paid'))) AS creatorCompensated,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'investor' AND u.status = 'active') AS investorTotal,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id JOIN investor_profiles ip ON ip.user_id = ur.user_id
            WHERE ur.role = 'investor' AND u.status = 'active'
              AND COALESCE(ip.sectors_json, '[]') <> '[]' AND COALESCE(ip.stages_json, '[]') <> '[]'
              AND COALESCE(ip.geographies_json, '[]') <> '[]' AND ip.minimum_ticket IS NOT NULL AND ip.maximum_ticket IS NOT NULL) AS investorReady,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'investor' AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM opportunity_user_states ous WHERE ous.user_id = ur.user_id AND ous.last_viewed_at IS NOT NULL)) AS investorViewed,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'investor' AND u.status = 'active'
              AND (EXISTS (SELECT 1 FROM project_interests pi WHERE pi.investor_user_id = ur.user_id AND pi.status <> 'withdrawn')
                OR EXISTS (SELECT 1 FROM introduction_requests ir WHERE ir.investor_user_id = ur.user_id AND ir.status NOT IN ('withdrawn','declined')))) AS investorInterest,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'investor' AND u.status = 'active'
              AND EXISTS (
                SELECT 1 FROM connections c
                WHERE c.status = 'accepted'
                  AND (c.requester_id = ur.user_id OR c.recipient_id = ur.user_id)
                  AND EXISTS (SELECT 1 FROM user_roles fr
                    WHERE fr.role = 'founder'
                      AND fr.user_id = CASE WHEN c.requester_id = ur.user_id THEN c.recipient_id ELSE c.requester_id END))) AS investorConnected,
          (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
            WHERE ur.role = 'investor' AND u.status = 'active'
              AND (EXISTS (SELECT 1 FROM project_interests pi WHERE pi.investor_user_id = ur.user_id AND pi.status IN ('contacted','closed'))
                OR EXISTS (SELECT 1 FROM introduction_requests ir WHERE ir.investor_user_id = ur.user_id AND ir.status IN ('approved','completed')))) AS investorProgressed`,
      )
      .first<OutcomeCounts>(),
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM campaign_applications WHERE created_at >= datetime('now', '-7 days')) AS creatorApplications7d,
          (SELECT COUNT(*) FROM campaign_applications WHERE created_at >= datetime('now', '-30 days')) AS creatorApplications30d,
          ((SELECT COUNT(*) FROM project_interests WHERE created_at >= datetime('now', '-7 days')) +
           (SELECT COUNT(*) FROM introduction_requests WHERE created_at >= datetime('now', '-7 days'))) AS investorSignals7d,
          ((SELECT COUNT(*) FROM project_interests WHERE created_at >= datetime('now', '-30 days')) +
           (SELECT COUNT(*) FROM introduction_requests WHERE created_at >= datetime('now', '-30 days'))) AS investorSignals30d,
          ((SELECT COUNT(*) FROM ambassador_campaigns WHERE created_at >= datetime('now', '-7 days') AND status IN ('submitted','published','closed')) +
           (SELECT COUNT(*) FROM opportunity_listings WHERE created_at >= datetime('now', '-7 days') AND status IN ('submitted','published','closed'))) AS founderActivations7d,
          ((SELECT COUNT(*) FROM ambassador_campaigns WHERE created_at >= datetime('now', '-30 days') AND status IN ('submitted','published','closed')) +
           (SELECT COUNT(*) FROM opportunity_listings WHERE created_at >= datetime('now', '-30 days') AND status IN ('submitted','published','closed'))) AS founderActivations30d`,
      )
      .first<RecentOutcomeCounts>(),
    db
      .prepare(
        `WITH review_items AS (
          SELECT 'membership' AS queueKey, 'membership:' || id AS itemKey, updated_at AS submittedAt
            FROM membership_applications WHERE status IN ('pending_email','pending_review','waitlisted')
          UNION ALL
          SELECT 'verification', 'verification:' || user_id || ':' || role, updated_at
            FROM role_verifications WHERE status = 'pending'
          UNION ALL
          SELECT 'project_claim', 'project_claim:' || project_id || ':' || user_id, updated_at
            FROM project_relationships WHERE claim_status = 'pending'
          UNION ALL
          SELECT 'moderation', 'moderation:' || id, updated_at
            FROM moderation_reports WHERE status IN ('open','reviewing')
        ), effective AS (
          SELECT ri.queueKey, ri.itemKey, ri.submittedAt,
                 COALESCE(rqs.waiting_on, 'akari') AS waitingOn,
                 COALESCE(rqs.paused_seconds, 0) + CASE
                   WHEN rqs.waiting_on = 'user' AND rqs.waiting_since IS NOT NULL
                     THEN MAX(0, CAST(strftime('%s','now') AS INTEGER) - CAST(strftime('%s', rqs.waiting_since) AS INTEGER))
                   ELSE 0 END AS pausedSeconds,
                 COALESCE(rsp.target_hours, CASE ri.queueKey
                   WHEN 'membership' THEN 48 WHEN 'verification' THEN 72
                   WHEN 'project_claim' THEN 72 ELSE 24 END) AS targetHours
            FROM review_items ri
            LEFT JOIN review_queue_state rqs ON rqs.item_key = ri.itemKey
            LEFT JOIN review_sla_policies rsp ON rsp.queue_key = ri.queueKey
        ), ages AS (
          SELECT *, MAX(0,
            CAST(strftime('%s','now') AS INTEGER) - CAST(strftime('%s', submittedAt) AS INTEGER) - pausedSeconds
          ) AS activeSeconds
          FROM effective
        )
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN waitingOn = 'user' THEN 1 ELSE 0 END) AS waitingUser,
               SUM(CASE WHEN waitingOn = 'akari' AND activeSeconds > targetHours * 3600 THEN 1 ELSE 0 END) AS overdue,
               SUM(CASE WHEN waitingOn = 'akari' AND activeSeconds <= targetHours * 3600
                              AND activeSeconds >= targetHours * 2700 THEN 1 ELSE 0 END) AS dueSoon,
               ROUND(COALESCE(AVG(activeSeconds / 3600.0), 0), 1) AS avgActiveAgeHours
          FROM ages`,
      )
      .first<ReviewHealth>(),
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
  const safeOutcomes: OutcomeCounts = outcomes ?? {
    founderTotal: 0,
    founderProject: 0,
    founderPublished: 0,
    founderVerified: 0,
    founderActivated: 0,
    founderEngaged: 0,
    creatorTotal: 0,
    creatorReady: 0,
    creatorApplied: 0,
    creatorShortlisted: 0,
    creatorAccepted: 0,
    creatorDelivered: 0,
    creatorApproved: 0,
    creatorCompensated: 0,
    investorTotal: 0,
    investorReady: 0,
    investorViewed: 0,
    investorInterest: 0,
    investorConnected: 0,
    investorProgressed: 0,
  };
  const safeRecent: RecentOutcomeCounts = recentOutcomes ?? {
    creatorApplications7d: 0,
    creatorApplications30d: 0,
    investorSignals7d: 0,
    investorSignals30d: 0,
    founderActivations7d: 0,
    founderActivations30d: 0,
  };
  const safeReviewHealth: ReviewHealth = reviewHealth ?? {
    total: 0,
    overdue: 0,
    dueSoon: 0,
    waitingUser: 0,
    avgActiveAgeHours: 0,
  };

  const actionMap = new Map<
    string,
    {
      shownUsers: number;
      clickedUsers: number;
      shownEvents: number;
      clickedEvents: number;
    }
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
    .sort(
      (a, b) => b.shownUsers - a.shownUsers || b.clickedUsers - a.clickedUsers,
    );

  const funnels: Array<{ key: string; title: string; stages: FunnelStage[] }> =
    [
      {
        key: "founder",
        title: "Founder outcome funnel",
        stages: [
          {
            label: "Founder role",
            count: Number(safeOutcomes.founderTotal),
            description: "Active accounts carrying the Founder role.",
          },
          {
            label: "Project managed",
            count: Number(safeOutcomes.founderProject),
            description:
              "Founder owns or collaborates on at least one Project.",
          },
          {
            label: "Project published",
            count: Number(safeOutcomes.founderPublished),
            description: "At least one managed Project is published.",
          },
          {
            label: "Relationship verified",
            count: Number(safeOutcomes.founderVerified),
            description:
              "AKARI verified a Founder, Co-Founder or authorized representative relationship.",
          },
          {
            label: "GTM or raise activated",
            count: Number(safeOutcomes.founderActivated),
            description:
              "A campaign or Investor opportunity entered an active workflow.",
          },
          {
            label: "Meaningful engagement",
            count: Number(safeOutcomes.founderEngaged),
            description:
              "The Project received Creator applications or Investor intent.",
          },
        ],
      },
      {
        key: "creator",
        title: "Creator outcome funnel",
        stages: [
          {
            label: "Creator role",
            count: Number(safeOutcomes.creatorTotal),
            description:
              "All active Creator accounts, including campaign participants who are not House members.",
          },
          {
            label: "Campaign ready",
            count: Number(safeOutcomes.creatorReady),
            description:
              "X profile, follower count, XScore and Sorsa Score are present. No follower threshold.",
          },
          {
            label: "Applied",
            count: Number(safeOutcomes.creatorApplied),
            description: "Applied to at least one Ambassador Campaign.",
          },
          {
            label: "Shortlisted or accepted",
            count: Number(safeOutcomes.creatorShortlisted),
            description: "Moved beyond initial application review.",
          },
          {
            label: "Accepted",
            count: Number(safeOutcomes.creatorAccepted),
            description: "Accepted into at least one campaign roster.",
          },
          {
            label: "Delivered",
            count: Number(safeOutcomes.creatorDelivered),
            description: "Submitted campaign work or content.",
          },
          {
            label: "Approved delivery",
            count: Number(safeOutcomes.creatorApproved),
            description: "At least one submitted deliverable was approved.",
          },
          {
            label: "Compensation allocated",
            count: Number(safeOutcomes.creatorCompensated),
            description:
              "Base campaign compensation was allocated or a recorded bonus was paid. This is not a base-payment settlement metric.",
          },
        ],
      },
      {
        key: "investor",
        title: "Investor outcome funnel",
        stages: [
          {
            label: "Investor role",
            count: Number(safeOutcomes.investorTotal),
            description: "Active accounts carrying the Investor role.",
          },
          {
            label: "Preferences ready",
            count: Number(safeOutcomes.investorReady),
            description:
              "Sectors, stages, geographies and cheque range are complete.",
          },
          {
            label: "Opportunity viewed",
            count: Number(safeOutcomes.investorViewed),
            description: "Viewed at least one curated Investor opportunity.",
          },
          {
            label: "Intent expressed",
            count: Number(safeOutcomes.investorInterest),
            description:
              "Expressed Project interest or requested an introduction.",
          },
          {
            label: "Founder connected",
            count: Number(safeOutcomes.investorConnected),
            description: "Has an accepted AKARI connection with a Founder.",
          },
          {
            label: "Relationship progressed",
            count: Number(safeOutcomes.investorProgressed),
            description:
              "Interest reached contacted/closed or an introduction reached approved/completed.",
          },
        ],
      },
    ];

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
    funnels: funnels.map((funnel) => ({
      ...funnel,
      largestDropoff: largestDropoff(funnel.stages),
    })),
    recentOutcomes: safeRecent,
    reviewHealth: safeReviewHealth,
  };
}

export default function AdminActivation({ loaderData }: Route.ComponentProps) {
  const { readiness, engagement, recentOutcomes, reviewHealth } = loaderData;
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
            <span className="eyebrow">R76H outcome intelligence</span>
            <h1>Activation and outcome intelligence</h1>
            <p>
              Measure whether AKARI moves members from setup into real Founder,
              Creator and Investor outcomes. Outcome stages are derived from the
              operational source-of-truth tables instead of copying profile data
              into a second analytics system.
            </p>
          </div>
          <Link className="button button-primary" to="/admin/reviews">
            Open SLA review inbox
          </Link>
        </header>

        <AdminWorkspaceNav access={loaderData.access} />

        <section
          className="application-queue-summary"
          aria-label="Outcome summary"
        >
          <span>
            <strong>{Number(readiness.members)}</strong> active members
          </span>
          <span>
            <strong>{Number(engagement.shownUsers)}</strong> reached by next
            actions
          </span>
          <span>
            <strong>{Number(engagement.clickedUsers)}</strong> clicked a next
            action
          </span>
          <span>
            <strong>{loaderData.clickThroughRate}%</strong> member click-through
          </span>
        </section>

        <section className="status-card" aria-labelledby="outcome-window-title">
          <span className="chapter">7 / 30 day operating window</span>
          <h2 id="outcome-window-title">Recent outcome creation</h2>
          <div className="application-queue-summary">
            <span>
              <strong>
                {Number(recentOutcomes.creatorApplications7d)} /{" "}
                {Number(recentOutcomes.creatorApplications30d)}
              </strong>{" "}
              Creator applications
            </span>
            <span>
              <strong>
                {Number(recentOutcomes.investorSignals7d)} /{" "}
                {Number(recentOutcomes.investorSignals30d)}
              </strong>{" "}
              Investor intent signals
            </span>
            <span>
              <strong>
                {Number(recentOutcomes.founderActivations7d)} /{" "}
                {Number(recentOutcomes.founderActivations30d)}
              </strong>{" "}
              campaign / raise activations
            </span>
          </div>
        </section>

        {loaderData.funnels.map((funnel) => (
          <section
            key={funnel.key}
            aria-labelledby={`${funnel.key}-funnel-title`}
          >
            <div className="status-card">
              <span className="chapter">Source-of-truth outcomes</span>
              <h2 id={`${funnel.key}-funnel-title`}>{funnel.title}</h2>
              <p>
                {funnel.largestDropoff && funnel.largestDropoff.count > 0
                  ? `Largest current drop-off: ${funnel.largestDropoff.from} → ${funnel.largestDropoff.to} (${funnel.largestDropoff.count}).`
                  : "No measurable stage drop-off yet."}
              </p>
            </div>
            <div className="admin-overview-list">
              {funnel.stages.map((stage, index) => (
                <div className="admin-overview-row" key={stage.label}>
                  <strong>{stage.label}</strong>
                  <p>{stage.description}</p>
                  <span className="chapter">{stage.count} accounts</span>
                  <span className="admin-overview-row-action">
                    {index === 0
                      ? "Baseline"
                      : `${percent(stage.count, funnel.stages[0]?.count ?? 0)}% of baseline`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="status-card" aria-labelledby="review-health-title">
          <span className="chapter">Operations SLA</span>
          <h2 id="review-health-title">Review health</h2>
          <p>
            SLA age excludes time formally marked as waiting on the user. Open
            the review inbox to assign work or change queue targets.
          </p>
          <div className="application-queue-summary">
            <span>
              <strong>{Number(reviewHealth.total)}</strong> open reviews
            </span>
            <span>
              <strong>{Number(reviewHealth.overdue)}</strong> overdue
            </span>
            <span>
              <strong>{Number(reviewHealth.dueSoon)}</strong> due soon
            </span>
            <span>
              <strong>{Number(reviewHealth.waitingUser)}</strong> waiting on
              user
            </span>
            <span>
              <strong>
                {Number(reviewHealth.avgActiveAgeHours).toFixed(1)}h
              </strong>{" "}
              average active age
            </span>
          </div>
        </section>

        <section
          className="status-card"
          aria-labelledby="activation-readiness-title"
        >
          <span className="chapter">Current readiness</span>
          <h2 id="activation-readiness-title">Role activation health</h2>
          <p>
            These numbers come from current account state, so they include
            members who completed setup before event tracking started.
          </p>
        </section>

        <section
          className="admin-overview-list"
          aria-label="Role activation readiness"
        >
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

        <section
          className="status-card"
          aria-labelledby="activation-actions-title"
        >
          <span className="chapter">Last 30 days</span>
          <h2 id="activation-actions-title">Next-action engagement</h2>
          <p>
            Shown events are de-duplicated per member and action for one hour.
            Clicks are recorded when a member chooses a next-action card.
          </p>
        </section>

        <section
          className="admin-overview-list"
          aria-label="Activation action engagement"
        >
          {loaderData.actions.length ? (
            loaderData.actions.map((action) => (
              <div className="admin-overview-row" key={action.key}>
                <strong>{action.label}</strong>
                <p>
                  {action.shownUsers} unique shown, {action.clickedUsers} unique
                  clicked. {action.shownEvents} impressions and{" "}
                  {action.clickedEvents} clicks recorded.
                </p>
                <span className="chapter">
                  {action.clickRate}% click-through
                </span>
                <span className="admin-overview-row-action">{action.key}</span>
              </div>
            ))
          ) : (
            <div className="status-card">
              <h2>No activation events recorded yet.</h2>
              <p>
                Activation analytics starts collecting privacy-minimal events
                after deployment.
              </p>
            </div>
          )}
        </section>

        <section
          className="status-card"
          aria-labelledby="activation-milestones-title"
        >
          <span className="chapter">Durable milestones</span>
          <h2 id="activation-milestones-title">Recorded activation states</h2>
          <p>
            A milestone is stored once per member when AKARI observes the
            completed state. Historical outcome health remains represented by
            the live source-of-truth funnels above.
          </p>
          <div className="application-queue-summary">
            {loaderData.milestones.length ? (
              loaderData.milestones.map((milestone) => (
                <span key={milestone.milestoneKey}>
                  <strong>{Number(milestone.total)}</strong>{" "}
                  {milestone.milestoneKey}
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
