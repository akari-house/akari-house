import { Link } from "react-router";
import type { Route } from "./+types/admin-workspace";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import {
  visibleAdminWorkspaceItems,
  type AdminWorkspaceItem,
} from "~/lib/admin-workspace";
import { buildAdminNextAction } from "~/lib/activation-next-actions";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdmin } from "~/lib/membership.server";

interface QueueCounts {
  membership: number;
  verification: number;
  "project-claims": number;
  moderation: number;
  events: number;
  projects: number;
  campaigns: number;
  contact: number;
  operations: number;
  team: number;
  directory: number;
  production: number;
}

export const meta: Route.MetaFunction = () => [
  { title: "Admin Workspace | AKARI House" },
  {
    name: "description",
    content: "Scoped AKARI House administration and operational queues.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);
  const rawCounts = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM membership_applications
          WHERE status IN ('pending_email', 'pending_review', 'waitlisted')) AS membership,
        (SELECT COUNT(*) FROM user_roles ur
          JOIN users u ON u.id = ur.user_id AND u.status = 'active'
          JOIN membership_applications ma
            ON ma.user_id = ur.user_id AND ma.status = 'approved'
          LEFT JOIN role_verifications rv
            ON rv.user_id = ur.user_id AND rv.role = ur.role
          WHERE COALESCE(rv.status, 'pending') <> 'verified'
             OR NOT EXISTS (
               SELECT 1 FROM verification_provenance vp
               WHERE vp.user_id = ur.user_id AND vp.role = ur.role
                 AND vp.status = 'active'
                 AND (vp.review_due_at IS NULL OR vp.review_due_at > datetime('now'))
             )) AS verification,
        (SELECT COUNT(*) FROM project_relationships
          WHERE claim_status = 'pending') AS "project-claims",
        (SELECT COUNT(*) FROM moderation_reports
          WHERE status IN ('open', 'reviewing')) AS moderation,
        (SELECT COUNT(*) FROM events WHERE status = 'submitted') AS events,
        ((SELECT COUNT(*) FROM projects WHERE status = 'submitted') +
         (SELECT COUNT(*) FROM interest_requests WHERE status = 'pending')) AS projects,
        (SELECT COUNT(*) FROM ambassador_campaigns WHERE status = 'submitted') AS campaigns,
        (SELECT COUNT(*) FROM contact_messages
          WHERE status IN ('open', 'reviewing')) AS contact,
        ((SELECT COUNT(*) FROM delivery_outbox
            WHERE status IN ('queued', 'processing', 'failed', 'dead_letter')) +
         (SELECT COUNT(*) FROM scheduled_job_runs WHERE status = 'failed')) AS operations,
        (SELECT COUNT(*) FROM admin_users WHERE access_level = 'admin') AS team,
        (SELECT COUNT(*) FROM house_directory_entries WHERE status = 'draft') AS directory,
        (SELECT COUNT(*) FROM production_audit_runs WHERE status <> 'passed') AS production`,
    )
    .first<QueueCounts>();

  const counts: QueueCounts = rawCounts ?? {
    membership: 0,
    verification: 0,
    "project-claims": 0,
    moderation: 0,
    events: 0,
    projects: 0,
    campaigns: 0,
    contact: 0,
    operations: 0,
    team: 0,
    directory: 0,
    production: 0,
  };

  const items = visibleAdminWorkspaceItems(access).map((item) => ({
    ...item,
    count: counts[item.key as keyof QueueCounts] ?? 0,
  }));

  const nextAction = buildAdminNextAction(items);
  const attentionCount = nextAction.remainingItemCount;

  return { user, access, items, attentionCount, nextAction };
}

function workspaceStatus(item: AdminWorkspaceItem & { count: number }) {
  if (item.key === "reviews") return "Unified trust queue";
  if (item.key === "activation") return "Live activation analytics";
  if (item.key === "team")
    return `${item.count} scoped administrator${item.count === 1 ? "" : "s"}`;
  if (item.key === "directory")
    return `${item.count} draft entr${item.count === 1 ? "y" : "ies"}`;
  return item.count ? `${item.count} waiting` : "Clear";
}

export default function AdminWorkspace({ loaderData }: Route.ComponentProps) {
  const next = loaderData.nextAction.next;
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main admin-workspace-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Superadmin operations</span>
            <h1>Admin workspace</h1>
            <p>
              Start with what needs a House decision. CRM, revenue, agreement
              and relationship operations now live only in CRM by AKARI.
            </p>
          </div>
          <div className="button-row">
            <a
              className="button button-primary"
              href="https://crm.akarihouse.com"
            >
              Open CRM by AKARI
            </a>
            <Link className="button button-quiet" to="/app">
              Return to your House
            </Link>
          </div>
        </header>
        <AdminWorkspaceNav access={loaderData.access} />

        <section
          className="application-queue-summary"
          aria-label="Admin summary"
        >
          <span>
            <strong>{loaderData.attentionCount}</strong> items need attention
          </span>
          <span>
            <strong>{loaderData.nextAction.activeQueueCount}</strong> active
            queues
          </span>
        </section>

        <section
          className="status-card"
          aria-labelledby="admin-next-action-title"
        >
          <span className="chapter">Next action</span>
          {next ? (
            <>
              <h2 id="admin-next-action-title">
                Review {next.label.toLowerCase()} first.
              </h2>
              <p>
                {next.count} item{next.count === 1 ? " is" : "s are"} waiting in
                this queue. {next.description}
              </p>
              <div className="button-row">
                <Link className="button button-primary" to={next.to}>
                  Open priority queue
                </Link>
                <span className="chapter">
                  {loaderData.nextAction.remainingItemCount} total decisions
                  waiting
                </span>
              </div>
            </>
          ) : (
            <>
              <h2 id="admin-next-action-title">
                No review queue needs action.
              </h2>
              <p>
                Membership, verification, Project claims, Events, moderation and
                the operational queues are currently clear.
              </p>
            </>
          )}
        </section>

        <section className="status-card" aria-labelledby="crm-boundary-title">
          <span className="chapter">Product boundary</span>
          <h2 id="crm-boundary-title">One CRM source of truth.</h2>
          <p>
            Agreements, governed relationship intelligence, operating rhythm,
            finance and SaaS workspace administration are no longer operated in
            AKARI House. Use CRM by AKARI for those workflows. House keeps the
            professional network, projects, diligence, events and campaigns.
          </p>
          <a className="button button-quiet" href="https://crm.akarihouse.com">
            Continue in CRM
          </a>
        </section>

        <section
          className="admin-overview-list"
          aria-label="Available admin tools"
        >
          {loaderData.items.map((item) => (
            <Link className="admin-overview-row" to={item.to} key={item.key}>
              <strong>{item.label}</strong>
              <p>{item.description}</p>
              <span className="chapter">{workspaceStatus(item)}</span>
              <span className="admin-overview-row-action">Open →</span>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
