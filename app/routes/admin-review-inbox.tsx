import { Link } from "react-router";
import type { Route } from "./+types/admin-review-inbox";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";

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
};

const kindPriority: Record<ReviewKind, number> = {
  membership: 110,
  verification: 105,
  project_claim: 103,
  moderation: 100,
};

function itemAgeHours(value: string) {
  const timestamp = Date.parse(value.replace(" ", "T") + "Z");
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
}

function withAgePriority(
  item: Omit<ReviewInboxItem, "priority">,
): ReviewInboxItem {
  return {
    ...item,
    priority:
      kindPriority[item.kind] +
      Math.min(72, Math.floor(itemAgeHours(item.submittedAt) / 12)),
  };
}

export const meta: Route.MetaFunction = () => [
  { title: "Unified Review Inbox | AKARI House" },
  {
    name: "description",
    content:
      "Superadmin triage across AKARI House trust and governance queues.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);

  const [memberships, verifications, claims, moderation] = await Promise.all([
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
  ]);

  const items: ReviewInboxItem[] = [
    ...memberships.results.map((row) =>
      withAgePriority({
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
      withAgePriority({
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
      withAgePriority({
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
      withAgePriority({
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

  const requestedKind = new URL(request.url).searchParams.get("kind");
  const kindFilter = [
    "membership",
    "verification",
    "project_claim",
    "moderation",
  ].includes(requestedKind ?? "")
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
    total: items.length,
    kindFilter,
  };
}

function kindHref(kind: "all" | ReviewKind) {
  return kind === "all" ? "/admin/reviews" : `/admin/reviews?kind=${kind}`;
}

function displayTime(value: string) {
  const date = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
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
            <span className="eyebrow">R76G governance inbox</span>
            <h1>Unified review inbox</h1>
            <p>
              Triage the House trust queues from one place, then open the
              existing governed desk for the actual decision. This keeps one
              source of truth for every approval workflow.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin/activation">
            View activation analytics
          </Link>
        </header>

        <AdminWorkspaceNav access={loaderData.access} />

        <section
          className="application-queue-summary"
          aria-label="Review queue summary"
        >
          <span>
            <strong>{loaderData.total}</strong> trust decisions waiting
          </span>
          <span>
            <strong>{loaderData.counts.membership}</strong> membership
          </span>
          <span>
            <strong>{loaderData.counts.verification}</strong> verification
          </span>
          <span>
            <strong>{loaderData.counts.projectClaims}</strong> project claims
          </span>
          <span>
            <strong>{loaderData.counts.moderation}</strong> moderation
          </span>
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
                    <span>{item.status}</span>
                  </span>
                  <time dateTime={item.submittedAt}>
                    {displayTime(item.submittedAt)}
                  </time>
                </summary>
                <div className="admin-review-body">
                  <div className="admin-review-evidence">
                    <span className="chapter">Review context</span>
                    <p>{item.evidence}</p>
                  </div>
                  <div className="admin-review-form">
                    <span className="chapter">Governed decision</span>
                    <p className="admin-scope-help">
                      Open the specialist desk to approve, hold, reject or
                      resolve this item with the existing audit and notification
                      workflow.
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
