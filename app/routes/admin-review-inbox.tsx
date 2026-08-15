import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin-review-inbox";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import {
  calculateReviewSla,
  reviewSlaPriorityBoost,
  type ReviewSlaResult,
  type ReviewWaitingOn,
} from "~/lib/review-sla";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type ReviewKind =
  "membership" | "verification" | "project_claim" | "moderation";

type ReviewInboxItem = {
  key: string;
  kind: ReviewKind;
  queueLabel: string;
  title: string;
  subject: string;
  status: string;
  evidence: string;
  submittedAt: string;
  to: string;
  priority: number;
  assignedTo: string | null;
  assignedUsername: string;
  waitingOn: ReviewWaitingOn;
  sla: ReviewSlaResult;
};

type ReviewPolicy = {
  queueKey: ReviewKind;
  targetHours: number;
  enabled: number;
};

type ReviewQueueState = {
  itemKey: string;
  queueKey: ReviewKind;
  assignedTo: string | null;
  assignedUsername: string;
  waitingOn: ReviewWaitingOn;
  waitingSince: string | null;
  pausedSeconds: number;
};

const kindPriority: Record<ReviewKind, number> = {
  membership: 110,
  verification: 105,
  project_claim: 103,
  moderation: 100,
};

const defaultTargets: Record<ReviewKind, number> = {
  membership: 48,
  verification: 72,
  project_claim: 72,
  moderation: 24,
};

const queueLabels: Record<ReviewKind, string> = {
  membership: "Membership",
  verification: "Role verification",
  project_claim: "Project claim",
  moderation: "Moderation",
};

function isReviewKind(value: string): value is ReviewKind {
  return ["membership", "verification", "project_claim", "moderation"].includes(
    value,
  );
}

function itemKeyMatchesQueue(itemKey: string, queueKey: ReviewKind) {
  return itemKey.startsWith(`${queueKey}:`);
}

function returnToReviewInbox(kind: string) {
  return isReviewKind(kind)
    ? `/admin/reviews?kind=${encodeURIComponent(kind)}`
    : "/admin/reviews";
}

function policyTarget(
  policies: Map<ReviewKind, ReviewPolicy>,
  kind: ReviewKind,
) {
  return Number(policies.get(kind)?.targetHours ?? defaultTargets[kind]);
}

export const meta: Route.MetaFunction = () => [
  { title: "Unified Review Inbox | AKARI House" },
  {
    name: "description",
    content:
      "Superadmin triage, ownership and SLA operations across AKARI House trust queues.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);

  const [
    memberships,
    verifications,
    claims,
    moderation,
    policyRows,
    stateRows,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT ma.id, ma.status, ma.applicant_note AS applicantNote,
                  ma.updated_at AS submittedAt, u.username,
                  p.display_name AS displayName
             FROM membership_applications ma
             JOIN users u ON u.id = ma.user_id
             JOIN profiles p ON p.user_id = ma.user_id
            WHERE ma.status IN ('pending_email', 'pending_review', 'waitlisted')
            ORDER BY CASE ma.status
                       WHEN 'pending_review' THEN 0
                       WHEN 'waitlisted' THEN 1
                       ELSE 2
                     END,
                     ma.updated_at ASC
            LIMIT 50`,
      )
      .all<{
        id: string;
        status: string;
        applicantNote: string;
        submittedAt: string;
        username: string;
        displayName: string;
      }>(),
    db
      .prepare(
        `SELECT rv.user_id AS userId, rv.role, rv.status,
                  rv.decision_note AS decisionNote, rv.updated_at AS submittedAt,
                  u.username, p.display_name AS displayName
             FROM role_verifications rv
             JOIN users u ON u.id = rv.user_id AND u.status = 'active'
             JOIN profiles p ON p.user_id = rv.user_id
            WHERE rv.status = 'pending'
            ORDER BY CASE WHEN rv.reviewed_at IS NULL THEN 0 ELSE 1 END,
                     rv.updated_at ASC
            LIMIT 50`,
      )
      .all<{
        userId: string;
        role: string;
        status: string;
        decisionNote: string;
        submittedAt: string;
        username: string;
        displayName: string;
      }>(),
    db
      .prepare(
        `SELECT rel.project_id AS projectId, rel.user_id AS userId,
                  rel.relationship_type AS relationshipType,
                  rel.evidence_url AS evidenceUrl,
                  rel.evidence_note AS evidenceNote,
                  rel.updated_at AS submittedAt,
                  pr.title AS projectTitle, u.username,
                  p.display_name AS displayName
             FROM project_relationships rel
             JOIN projects pr ON pr.id = rel.project_id
             JOIN users u ON u.id = rel.user_id
             JOIN profiles p ON p.user_id = rel.user_id
            WHERE rel.claim_status = 'pending'
            ORDER BY rel.updated_at ASC
            LIMIT 50`,
      )
      .all<{
        projectId: string;
        userId: string;
        relationshipType: string;
        evidenceUrl: string;
        evidenceNote: string;
        submittedAt: string;
        projectTitle: string;
        username: string;
        displayName: string;
      }>(),
    db
      .prepare(
        `SELECT mr.id, mr.subject_type AS subjectType,
                  mr.reason, mr.details, mr.status,
                  mr.updated_at AS submittedAt,
                  u.username, p.display_name AS displayName
             FROM moderation_reports mr
             JOIN users u ON u.id = mr.reporter_user_id
             JOIN profiles p ON p.user_id = mr.reporter_user_id
            WHERE mr.status IN ('open', 'reviewing')
            ORDER BY mr.updated_at ASC
            LIMIT 50`,
      )
      .all<{
        id: string;
        subjectType: string;
        reason: string;
        details: string;
        status: string;
        submittedAt: string;
        username: string;
        displayName: string;
      }>(),
    db
      .prepare(
        `SELECT queue_key AS queueKey, target_hours AS targetHours,
                  enabled
             FROM review_sla_policies
            ORDER BY queue_key`,
      )
      .all<ReviewPolicy>(),
    db
      .prepare(
        `SELECT rqs.item_key AS itemKey, rqs.queue_key AS queueKey,
                  rqs.assigned_to AS assignedTo,
                  COALESCE(u.username, '') AS assignedUsername,
                  rqs.waiting_on AS waitingOn,
                  rqs.waiting_since AS waitingSince,
                  rqs.paused_seconds AS pausedSeconds
             FROM review_queue_state rqs
             LEFT JOIN users u ON u.id = rqs.assigned_to`,
      )
      .all<ReviewQueueState>(),
  ]);

  const policies = new Map<ReviewKind, ReviewPolicy>(
    policyRows.results.map((row) => [row.queueKey, row]),
  );
  const queueState = new Map<string, ReviewQueueState>(
    stateRows.results.map((row) => [row.itemKey, row]),
  );

  const buildItem = (
    item: Omit<
      ReviewInboxItem,
      "priority" | "assignedTo" | "assignedUsername" | "waitingOn" | "sla"
    >,
  ): ReviewInboxItem => {
    const operational = queueState.get(item.key);
    const waitingOn = operational?.waitingOn ?? "akari";
    const sla = calculateReviewSla({
      submittedAt: item.submittedAt,
      targetHours: policyTarget(policies, item.kind),
      waitingOn,
      waitingSince: operational?.waitingSince ?? null,
      pausedSeconds: Number(operational?.pausedSeconds ?? 0),
    });
    return {
      ...item,
      assignedTo: operational?.assignedTo ?? null,
      assignedUsername: operational?.assignedUsername ?? "",
      waitingOn,
      sla,
      priority: kindPriority[item.kind] + reviewSlaPriorityBoost(sla),
    };
  };

  const items: ReviewInboxItem[] = [
    ...memberships.results.map((row) =>
      buildItem({
        key: `membership:${row.id}`,
        kind: "membership",
        queueLabel: "Membership",
        title: row.displayName,
        subject: `@${row.username}`,
        status: row.status.replaceAll("_", " "),
        evidence: row.applicantNote || "No applicant note supplied.",
        submittedAt: row.submittedAt,
        to: "/admin/applications",
      }),
    ),
    ...verifications.results.map((row) =>
      buildItem({
        key: `verification:${row.userId}:${row.role}`,
        kind: "verification",
        queueLabel: "Role verification",
        title: `${row.displayName} · ${row.role}`,
        subject: `@${row.username}`,
        status: row.status,
        evidence:
          row.decisionNote ||
          "Review the professional evidence and provenance in the verification desk.",
        submittedAt: row.submittedAt,
        to: `/admin/verifications?role=${encodeURIComponent(row.role)}`,
      }),
    ),
    ...claims.results.map((row) =>
      buildItem({
        key: `project_claim:${row.projectId}:${row.userId}`,
        kind: "project_claim",
        queueLabel: "Project claim",
        title: `${row.displayName} · ${row.projectTitle}`,
        subject: `${row.relationshipType.replaceAll("_", " ")} · @${row.username}`,
        status: "pending",
        evidence:
          row.evidenceNote ||
          row.evidenceUrl ||
          "No supporting evidence note supplied.",
        submittedAt: row.submittedAt,
        to: "/admin/project-claims",
      }),
    ),
    ...moderation.results.map((row) =>
      buildItem({
        key: `moderation:${row.id}`,
        kind: "moderation",
        queueLabel: "Moderation",
        title: `${row.subjectType} report · ${row.reason}`,
        subject: `Reported by ${row.displayName} (@${row.username})`,
        status: row.status,
        evidence: row.details || "No additional report details supplied.",
        submittedAt: row.submittedAt,
        to: "/admin/moderation",
      }),
    ),
  ].sort(
    (a, b) =>
      b.priority - a.priority ||
      Date.parse(a.submittedAt) - Date.parse(b.submittedAt),
  );

  const counts = {
    membership: memberships.results.length,
    verification: verifications.results.length,
    projectClaims: claims.results.length,
    moderation: moderation.results.length,
  };
  const slaCounts = {
    overdue: items.filter((item) => item.sla.state === "overdue").length,
    dueSoon: items.filter((item) => item.sla.state === "due_soon").length,
    waitingUser: items.filter((item) => item.sla.state === "waiting_user")
      .length,
    assignedToMe: items.filter((item) => item.assignedTo === user.id).length,
  };

  const requestedKind = new URL(request.url).searchParams.get("kind");
  const kindFilter = isReviewKind(requestedKind ?? "")
    ? (requestedKind as ReviewKind)
    : "all";
  const visibleItems =
    kindFilter === "all"
      ? items
      : items.filter((item) => item.kind === kindFilter);

  return {
    user,
    access,
    items: visibleItems,
    counts,
    slaCounts,
    total: items.length,
    kindFilter,
    policies: (
      [
        "membership",
        "verification",
        "project_claim",
        "moderation",
      ] as ReviewKind[]
    ).map((queueKey) => ({
      queueKey,
      label: queueLabels[queueKey],
      targetHours: policyTarget(policies, queueKey),
    })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const returnKind = formText(form.get("returnKind"));

  if (intent === "update-sla") {
    const queueKey = formText(form.get("queueKey"));
    const targetHours = Number(form.get("targetHours"));
    if (
      !isReviewKind(queueKey) ||
      !Number.isInteger(targetHours) ||
      targetHours < 1 ||
      targetHours > 720
    )
      throw new Response("Invalid SLA policy.", { status: 400 });

    await db
      .prepare(
        `INSERT INTO review_sla_policies
           (queue_key, target_hours, enabled, updated_by, updated_at)
         VALUES (?, ?, 1, ?, datetime('now'))
         ON CONFLICT(queue_key) DO UPDATE SET
           target_hours = excluded.target_hours,
           enabled = 1,
           updated_by = excluded.updated_by,
           updated_at = datetime('now')`,
      )
      .bind(queueKey, targetHours, user.id)
      .run();
    throw redirect(returnToReviewInbox(returnKind));
  }

  const itemKey = formText(form.get("itemKey"));
  const queueKey = formText(form.get("queueKey"));
  if (
    !isReviewKind(queueKey) ||
    !itemKeyMatchesQueue(itemKey, queueKey) ||
    itemKey.length > 300
  )
    throw new Response("Invalid review item.", { status: 400 });

  if (intent === "assign-me") {
    await db
      .prepare(
        `INSERT INTO review_queue_state
           (item_key, queue_key, assigned_to, updated_by, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(item_key) DO UPDATE SET
           assigned_to = excluded.assigned_to,
           queue_key = excluded.queue_key,
           updated_by = excluded.updated_by,
           updated_at = datetime('now')`,
      )
      .bind(itemKey, queueKey, user.id, user.id)
      .run();
  } else if (intent === "unassign") {
    await db
      .prepare(
        `INSERT INTO review_queue_state
           (item_key, queue_key, assigned_to, updated_by, updated_at)
         VALUES (?, ?, NULL, ?, datetime('now'))
         ON CONFLICT(item_key) DO UPDATE SET
           assigned_to = NULL,
           queue_key = excluded.queue_key,
           updated_by = excluded.updated_by,
           updated_at = datetime('now')`,
      )
      .bind(itemKey, queueKey, user.id)
      .run();
  } else if (intent === "waiting-user") {
    await db
      .prepare(
        `INSERT INTO review_queue_state
           (item_key, queue_key, waiting_on, waiting_since, updated_by, updated_at)
         VALUES (?, ?, 'user', datetime('now'), ?, datetime('now'))
         ON CONFLICT(item_key) DO UPDATE SET
           queue_key = excluded.queue_key,
           waiting_on = 'user',
           waiting_since = CASE
             WHEN review_queue_state.waiting_on = 'user'
               THEN review_queue_state.waiting_since
             ELSE datetime('now')
           END,
           updated_by = excluded.updated_by,
           updated_at = datetime('now')`,
      )
      .bind(itemKey, queueKey, user.id)
      .run();
  } else if (intent === "waiting-akari") {
    await db
      .prepare(
        `INSERT INTO review_queue_state
           (item_key, queue_key, waiting_on, waiting_since, updated_by, updated_at)
         VALUES (?, ?, 'akari', NULL, ?, datetime('now'))
         ON CONFLICT(item_key) DO UPDATE SET
           queue_key = excluded.queue_key,
           paused_seconds = review_queue_state.paused_seconds + CASE
             WHEN review_queue_state.waiting_on = 'user'
                  AND review_queue_state.waiting_since IS NOT NULL
               THEN MAX(0, CAST((julianday('now') - julianday(review_queue_state.waiting_since)) * 86400 AS INTEGER))
             ELSE 0
           END,
           waiting_on = 'akari',
           waiting_since = NULL,
           updated_by = excluded.updated_by,
           updated_at = datetime('now')`,
      )
      .bind(itemKey, queueKey, user.id)
      .run();
  } else {
    throw new Response("Unsupported review operation.", { status: 400 });
  }

  throw redirect(returnToReviewInbox(returnKind));
}

function kindHref(kind: "all" | ReviewKind) {
  return kind === "all" ? "/admin/reviews" : `/admin/reviews?kind=${kind}`;
}

function displayTime(value: string) {
  const date = new Date(
    value.includes("T") ? value : value.replace(" ", "T") + "Z",
  );
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function slaLabel(sla: ReviewSlaResult) {
  if (sla.state === "waiting_user") return "Waiting on user · SLA paused";
  if (sla.state === "overdue")
    return `${Math.abs(sla.remainingHours)}h overdue`;
  if (sla.state === "due_soon") return `${sla.remainingHours}h remaining`;
  return `${sla.remainingHours}h remaining`;
}

export default function AdminReviewInbox({ loaderData }: Route.ComponentProps) {
  const filters: Array<{
    key: "all" | ReviewKind;
    label: string;
    count: number;
  }> = [
    { key: "all", label: "All", count: loaderData.total },
    {
      key: "membership",
      label: "Membership",
      count: loaderData.counts.membership,
    },
    {
      key: "verification",
      label: "Verification",
      count: loaderData.counts.verification,
    },
    {
      key: "project_claim",
      label: "Project claims",
      count: loaderData.counts.projectClaims,
    },
    {
      key: "moderation",
      label: "Moderation",
      count: loaderData.counts.moderation,
    },
  ];

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main admin-workspace-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">R76H outcome operations</span>
            <h1>Unified review inbox</h1>
            <p>
              Triage trust decisions by ownership and SLA, then use the existing
              governed desk for the actual decision. Waiting on a user pauses
              the operational SLA clock instead of creating a false breach.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin/activation">
            View outcome intelligence
          </Link>
        </header>

        <AdminWorkspaceNav access={loaderData.access} />

        <section
          className="application-queue-summary"
          aria-label="Review SLA summary"
        >
          <span>
            <strong>{loaderData.total}</strong> decisions waiting
          </span>
          <span>
            <strong>{loaderData.slaCounts.overdue}</strong> overdue
          </span>
          <span>
            <strong>{loaderData.slaCounts.dueSoon}</strong> due soon
          </span>
          <span>
            <strong>{loaderData.slaCounts.waitingUser}</strong> waiting on user
          </span>
          <span>
            <strong>{loaderData.slaCounts.assignedToMe}</strong> assigned to me
          </span>
        </section>

        <section className="status-card" aria-labelledby="sla-policy-title">
          <span className="chapter">Configurable operating targets</span>
          <h2 id="sla-policy-title">Review SLA policy</h2>
          <p>
            These are internal response targets, not promises to applicants.
            Superadmin can adjust them as AKARI staffing and review complexity
            change.
          </p>
          <div className="application-queue-summary">
            {loaderData.policies.map((policy) => (
              <Form
                method="post"
                key={policy.queueKey}
                className="admin-inline-form"
              >
                <input type="hidden" name="intent" value="update-sla" />
                <input type="hidden" name="queueKey" value={policy.queueKey} />
                <input
                  type="hidden"
                  name="returnKind"
                  value={loaderData.kindFilter}
                />
                <label>
                  {policy.label}
                  <input
                    name="targetHours"
                    type="number"
                    min="1"
                    max="720"
                    defaultValue={policy.targetHours}
                    aria-label={`${policy.label} target hours`}
                  />
                </label>
                <button className="button button-quiet" type="submit">
                  Save hours
                </button>
              </Form>
            ))}
          </div>
        </section>

        <div className="admin-queue-toolbar">
          <nav className="admin-filter-tabs" aria-label="Review queue filter">
            {filters.map((filter) => (
              <Link
                key={filter.key}
                to={kindHref(filter.key)}
                aria-current={
                  loaderData.kindFilter === filter.key ? "page" : undefined
                }
              >
                {filter.label} · {filter.count}
              </Link>
            ))}
          </nav>
        </div>

        <section
          className="admin-review-list"
          aria-label="Unified review queue"
        >
          {loaderData.items.length ? (
            loaderData.items.map((item) => (
              <details className="admin-review-item" key={item.key}>
                <summary>
                  <span className="admin-review-identity">
                    <strong>{item.title}</strong>
                    <span>{item.subject}</span>
                  </span>
                  <span className="admin-review-status">
                    <strong>{item.queueLabel}</strong>
                    <span>{slaLabel(item.sla)}</span>
                  </span>
                  <time dateTime={item.submittedAt}>
                    {item.sla.ageHours}h active age
                  </time>
                </summary>
                <div className="admin-review-body">
                  <div className="admin-review-evidence">
                    <span className="chapter">Review context</span>
                    <p>{item.evidence}</p>
                    <p className="admin-scope-help">
                      Status: {item.status}. Target: {item.sla.targetHours}h.
                      Due: {displayTime(item.sla.dueAt)}. Assigned:{" "}
                      {item.assignedUsername
                        ? `@${item.assignedUsername}`
                        : "unassigned"}
                      .
                    </p>
                  </div>
                  <div className="admin-review-form">
                    <span className="chapter">Operations</span>
                    <div className="button-row">
                      <Form method="post">
                        <input type="hidden" name="itemKey" value={item.key} />
                        <input
                          type="hidden"
                          name="queueKey"
                          value={item.kind}
                        />
                        <input
                          type="hidden"
                          name="returnKind"
                          value={loaderData.kindFilter}
                        />
                        <button
                          className="button button-quiet"
                          type="submit"
                          name="intent"
                          value={
                            item.assignedTo === loaderData.user.id
                              ? "unassign"
                              : "assign-me"
                          }
                        >
                          {item.assignedTo === loaderData.user.id
                            ? "Unassign me"
                            : "Assign to me"}
                        </button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="itemKey" value={item.key} />
                        <input
                          type="hidden"
                          name="queueKey"
                          value={item.kind}
                        />
                        <input
                          type="hidden"
                          name="returnKind"
                          value={loaderData.kindFilter}
                        />
                        <button
                          className="button button-quiet"
                          type="submit"
                          name="intent"
                          value={
                            item.waitingOn === "user"
                              ? "waiting-akari"
                              : "waiting-user"
                          }
                        >
                          {item.waitingOn === "user"
                            ? "Resume AKARI clock"
                            : "Waiting on user"}
                        </button>
                      </Form>
                    </div>
                    <p className="admin-scope-help">
                      Decisions still happen in the specialist desk so existing
                      audit, notification and permission rules remain the source
                      of truth.
                    </p>
                    <div className="button-row">
                      <Link className="button button-primary" to={item.to}>
                        Open {item.queueLabel.toLowerCase()} desk
                      </Link>
                    </div>
                  </div>
                </div>
              </details>
            ))
          ) : (
            <div className="status-card">
              <h2>This review queue is clear.</h2>
              <p>No items match the current trust filter.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
