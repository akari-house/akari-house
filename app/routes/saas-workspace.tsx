import { Link } from "react-router";
import type { Route } from "./+types/saas-workspace";
import { SiteHeader } from "~/components/SiteHeader";
import {
  moneyLabel,
  workspaceModuleLabels,
  workspaceModules,
} from "~/lib/commercial-saas";
import {
  loadWorkspaceEntitlements,
  requireWorkspaceAccess,
  workspaceCanViewFinance,
} from "~/lib/saas-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

type WorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  brandName: string;
  billingEmail: string;
  ownerName: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
};

type MemberRow = { label: string; role: string };
type ProjectRow = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  stage: string;
};
type InvoiceRow = {
  invoiceNumber: string;
  customerName: string;
  currency: string;
  totalCents: number;
  status: string;
  dueAt: string | null;
  collectedCents: number;
};

export const meta: Route.MetaFunction = ({ data }) => [
  {
    title: data
      ? `${data.workspace.name} Workspace | AKARI`
      : "Workspace | AKARI",
  },
  {
    name: "description",
    content:
      "Private AKARI workspace for team, modules, linked Projects and commercial status.",
  },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const { user, access } = await requireWorkspaceAccess(
    request,
    db,
    params.slug,
  );
  const [workspace, entitlements, members, projects] = await Promise.all([
    db
      .prepare(
        `SELECT w.id, w.name, w.slug, w.status, w.brand_name AS brandName,
                w.billing_email AS billingEmail,
                COALESCE(p.display_name, u.username) AS ownerName,
                s.trial_ends_at AS trialEndsAt, s.current_period_end AS currentPeriodEnd
         FROM saas_workspaces w
         JOIN users u ON u.id = w.owner_user_id
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN saas_workspace_subscriptions s ON s.workspace_id = w.id
         WHERE w.id = ?`,
      )
      .bind(access.workspaceId)
      .first<WorkspaceRecord>(),
    loadWorkspaceEntitlements(db, access.workspaceId),
    db
      .prepare(
        `SELECT COALESCE(p.display_name, u.username) AS label, wm.role
         FROM saas_workspace_members wm JOIN users u ON u.id = wm.user_id
         LEFT JOIN profiles p ON p.user_id = u.id
         WHERE wm.workspace_id = ? AND wm.status = 'active'
         ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'finance' THEN 2 ELSE 3 END, label`,
      )
      .bind(access.workspaceId)
      .all<MemberRow>(),
    db
      .prepare(
        `SELECT p.id, p.title, p.slug, p.summary, p.stage
         FROM saas_workspace_project_links l JOIN projects p ON p.id = l.project_id
         WHERE l.workspace_id = ? AND p.status <> 'declined'
         ORDER BY p.title COLLATE NOCASE`,
      )
      .bind(access.workspaceId)
      .all<ProjectRow>(),
  ]);
  if (!workspace) throw new Response("Workspace not found.", { status: 404 });

  let invoices: InvoiceRow[] = [];
  if (entitlements.modules.finance && workspaceCanViewFinance(access)) {
    const result = await db
      .prepare(
        `SELECT i.invoice_number AS invoiceNumber, i.customer_name AS customerName,
                i.currency, i.total_cents AS totalCents, i.status, i.due_at AS dueAt,
                COALESCE((SELECT SUM(cp.amount_cents - cp.refunded_amount_cents)
                  FROM commercial_payments cp
                  WHERE cp.invoice_id = i.id AND cp.status = 'cleared'), 0) AS collectedCents
         FROM commercial_invoices i
         WHERE i.workspace_id = ? AND i.status <> 'void'
         ORDER BY i.issued_at DESC, i.created_at DESC LIMIT 100`,
      )
      .bind(access.workspaceId)
      .all<InvoiceRow>();
    invoices = result.results;
  }

  return {
    user,
    access,
    workspace,
    entitlements,
    members: members.results,
    projects: projects.results,
    invoices,
    canViewFinance:
      entitlements.modules.finance && workspaceCanViewFinance(access),
  };
}

export default function SaasWorkspace({ loaderData }: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Private workspace</span>
            <h1>
              {loaderData.workspace.brandName || loaderData.workspace.name}
            </h1>
            <p>
              {loaderData.access.supportAccess
                ? "Superadmin support view. Workspace membership boundaries remain in effect for normal users."
                : `Your role: ${loaderData.access.role}.`}
            </p>
          </div>
          <span className="status-pill">{loaderData.workspace.status}</span>
        </header>

        <section
          className="admin-stat-grid"
          aria-label="Workspace subscription"
        >
          <article className="status-card">
            <span className="chapter">Plan</span>
            <strong>{loaderData.entitlements.planName}</strong>
            <small>{loaderData.entitlements.subscriptionStatus}</small>
          </article>
          <article className="status-card">
            <span className="chapter">Seats</span>
            <strong>
              {loaderData.members.length} / {loaderData.entitlements.seatLimit}
            </strong>
            <small>Active team members</small>
          </article>
          <article className="status-card">
            <span className="chapter">Storage limit</span>
            <strong>{loaderData.entitlements.storageLimitMb} MB</strong>
            <small>
              Usage is not shown until R2 objects are attributable to this
              workspace.
            </small>
          </article>
          <article className="status-card">
            <span className="chapter">Billing</span>
            <strong>{loaderData.workspace.billingEmail || "Not set"}</strong>
            <small>
              Period ends{" "}
              {loaderData.workspace.currentPeriodEnd?.slice(0, 10) ?? "not set"}
            </small>
          </article>
        </section>

        <section className="status-card">
          <div className="section-heading">
            <div>
              <span className="chapter">Modules</span>
              <h2>Workspace access</h2>
            </div>
          </div>
          <div className="chip-list">
            {workspaceModules.map((module) => (
              <span className="status-pill" key={module}>
                {workspaceModuleLabels[module]}:{" "}
                {loaderData.entitlements.modules[module] ? "Enabled" : "Off"}
              </span>
            ))}
          </div>
        </section>

        <section className="status-card">
          <div className="section-heading">
            <div>
              <span className="chapter">Team</span>
              <h2>{loaderData.members.length} active members</h2>
            </div>
          </div>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {loaderData.members.map((member, index) => (
                  <tr key={`${member.label}-${index}`}>
                    <td>{member.label}</td>
                    <td>{member.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="status-card">
          <div className="section-heading">
            <div>
              <span className="chapter">Projects</span>
              <h2>Linked workspace Projects</h2>
            </div>
            <p>Only explicitly linked Projects appear here.</p>
          </div>
          {loaderData.projects.length === 0 && (
            <p>No Projects are linked to this workspace.</p>
          )}
          <div className="admin-stat-grid">
            {loaderData.projects.map((project) => (
              <article className="status-card" key={project.id}>
                <span className="chapter">
                  {project.stage.replaceAll("_", " ")}
                </span>
                <strong>{project.title}</strong>
                <p>{project.summary}</p>
                <Link to={`/projects/${project.slug}`}>
                  Open public Project profile
                </Link>
              </article>
            ))}
          </div>
        </section>

        {loaderData.canViewFinance && (
          <section className="status-card">
            <div className="section-heading">
              <div>
                <span className="chapter">Finance</span>
                <h2>Workspace invoices</h2>
              </div>
              <p>
                Visible only to Owner, Admin, Finance and Superadmin support
                access.
              </p>
            </div>
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Amount</th>
                    <th>Collected</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loaderData.invoices.map((invoice) => (
                    <tr key={invoice.invoiceNumber}>
                      <td>
                        {invoice.invoiceNumber}
                        <br />
                        <small>{invoice.customerName}</small>
                      </td>
                      <td>
                        {moneyLabel(invoice.totalCents, invoice.currency)}
                      </td>
                      <td>
                        {moneyLabel(invoice.collectedCents, invoice.currency)}
                      </td>
                      <td>{invoice.dueAt ?? "Not set"}</td>
                      <td>{invoice.status.replaceAll("_", " ")}</td>
                    </tr>
                  ))}
                  {loaderData.invoices.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        No invoices are linked to this workspace.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
