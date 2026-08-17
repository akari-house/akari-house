import { Form, Link, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/admin-saas-workspaces";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import {
  isSubscriptionStatus,
  isWorkspaceModule,
  isWorkspaceRole,
  isWorkspaceStatus,
  moneyLabel,
  normalizeCurrency,
  normalizeWorkspaceSlug,
  subscriptionStatuses,
  workspaceModuleLabels,
  workspaceModules,
  workspaceRoles,
  workspaceStatuses,
} from "~/lib/commercial-saas";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { loadWorkspaceEntitlements } from "~/lib/saas-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, normalizeEmail, validateEmail } from "~/lib/validation";

type WorkspaceRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  ownerUserId: string;
  ownerName: string;
  primaryProjectId: string | null;
  projectTitle: string | null;
  billingEmail: string;
  brandName: string;
  planId: string | null;
  planName: string | null;
  planCode: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  memberCount: number;
};

type PlanRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  monthlyPriceCents: number;
  currency: string;
  seatLimit: number;
  storageLimitMb: number;
  entitlementsJson: string;
};

type UserOption = { id: string; label: string; email: string };
type ProjectOption = { id: string; title: string; slug: string };
type MemberRow = { userId: string; label: string; email: string; role: string; status: string };
type InviteRow = { id: string; email: string; role: string; status: string; expiresAt: string | null; createdAt: string };

function integer(value: FormDataEntryValue | null, minimum = 1) {
  const parsed = Number.parseInt(formText(value), 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : null;
}

function cents(value: FormDataEntryValue | null) {
  const raw = formText(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

function dateValue(value: FormDataEntryValue | null) {
  const raw = formText(value).trim();
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

function planEntitlements(form: FormData) {
  return JSON.stringify(
    Object.fromEntries(workspaceModules.map((module) => [module, formText(form.get(`module_${module}`)) === "1"])),
  );
}

export const meta: Route.MetaFunction = () => [
  { title: "SaaS Workspaces | AKARI House" },
  {
    name: "description",
    content: "Workspace provisioning, plans, roles, modules and subscription administration.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);
  const url = new URL(request.url);
  const selectedWorkspaceId = formText(url.searchParams.get("workspace")).trim();

  const [workspaces, plans, users, projects] = await Promise.all([
    db
      .prepare(
        `SELECT w.id, w.slug, w.name, w.status, w.owner_user_id AS ownerUserId,
                COALESCE(op.display_name, ou.username) AS ownerName,
                w.primary_project_id AS primaryProjectId, p.title AS projectTitle,
                w.billing_email AS billingEmail, w.brand_name AS brandName,
                s.plan_id AS planId, sp.name AS planName, sp.code AS planCode,
                s.status AS subscriptionStatus, s.trial_ends_at AS trialEndsAt,
                s.current_period_end AS currentPeriodEnd,
                (SELECT COUNT(*) FROM saas_workspace_members wm
                 WHERE wm.workspace_id = w.id AND wm.status = 'active') AS memberCount
         FROM saas_workspaces w
         JOIN users ou ON ou.id = w.owner_user_id
         LEFT JOIN profiles op ON op.user_id = ou.id
         LEFT JOIN projects p ON p.id = w.primary_project_id
         LEFT JOIN saas_workspace_subscriptions s ON s.workspace_id = w.id
         LEFT JOIN saas_plans sp ON sp.id = s.plan_id
         ORDER BY CASE w.status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'suspended' THEN 2 ELSE 3 END,
                  w.updated_at DESC`,
      )
      .all<WorkspaceRow>(),
    db
      .prepare(
        `SELECT id, code, name, status, monthly_price_cents AS monthlyPriceCents,
                currency, seat_limit AS seatLimit, storage_limit_mb AS storageLimitMb,
                entitlements_json AS entitlementsJson
         FROM saas_plans ORDER BY status, monthly_price_cents, name`,
      )
      .all<PlanRow>(),
    db
      .prepare(
        `SELECT u.id, COALESCE(p.display_name, u.username) AS label, u.email
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
         WHERE u.status = 'active' ORDER BY label COLLATE NOCASE LIMIT 1000`,
      )
      .all<UserOption>(),
    db
      .prepare("SELECT id, title, slug FROM projects WHERE status <> 'declined' ORDER BY title COLLATE NOCASE LIMIT 500")
      .all<ProjectOption>(),
  ]);

  const selected = selectedWorkspaceId
    ? workspaces.results.find((workspace) => workspace.id === selectedWorkspaceId) ?? null
    : workspaces.results[0] ?? null;

  let members: MemberRow[] = [];
  let invites: InviteRow[] = [];
  let linkedProjects: ProjectOption[] = [];
  let entitlements: Awaited<ReturnType<typeof loadWorkspaceEntitlements>> | null = null;
  if (selected) {
    const [memberResult, inviteResult, linkResult, effective] = await Promise.all([
      db
        .prepare(
          `SELECT wm.user_id AS userId, COALESCE(p.display_name, u.username) AS label,
                  u.email, wm.role, wm.status
           FROM saas_workspace_members wm JOIN users u ON u.id = wm.user_id
           LEFT JOIN profiles p ON p.user_id = u.id
           WHERE wm.workspace_id = ? ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'finance' THEN 2 ELSE 3 END, label`,
        )
        .bind(selected.id)
        .all<MemberRow>(),
      db
        .prepare(
          `SELECT id, email, role, status, expires_at AS expiresAt, created_at AS createdAt
           FROM saas_workspace_invitations WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100`,
        )
        .bind(selected.id)
        .all<InviteRow>(),
      db
        .prepare(
          `SELECT p.id, p.title, p.slug FROM saas_workspace_project_links l
           JOIN projects p ON p.id = l.project_id WHERE l.workspace_id = ? ORDER BY p.title`,
        )
        .bind(selected.id)
        .all<ProjectOption>(),
      loadWorkspaceEntitlements(db, selected.id),
    ]);
    members = memberResult.results;
    invites = inviteResult.results;
    linkedProjects = linkResult.results;
    entitlements = effective;
  }

  return {
    user,
    access,
    workspaces: workspaces.results,
    plans: plans.results,
    users: users.results,
    projects: projects.results,
    selected,
    members,
    invites,
    linkedProjects,
    entitlements,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireSuperAdmin(request, db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "create-plan") {
    const code = formText(form.get("code")).trim().toLowerCase();
    const name = formText(form.get("name")).trim();
    const monthlyPriceCents = cents(form.get("monthlyPrice"));
    const currency = normalizeCurrency(formText(form.get("currency")));
    const seatLimit = integer(form.get("seatLimit"));
    const storageLimitMb = integer(form.get("storageLimitMb"));
    if (!/^[a-z0-9_-]{2,50}$/.test(code) || name.length < 2 || name.length > 100 || monthlyPriceCents === null || !currency || !seatLimit || !storageLimitMb)
      return { error: "Check the plan code, price and limits." };
    const id = crypto.randomUUID();
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO saas_plans
             (id, code, name, monthly_price_cents, currency, seat_limit, storage_limit_mb,
              entitlements_json, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, code, name, monthlyPriceCents, currency, seatLimit, storageLimitMb, planEntitlements(form), admin.id, admin.id),
        db
          .prepare(
            `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json)
             VALUES (?, ?, 'saas_plan.created', 'saas_plan', ?, ?)`,
          )
          .bind(crypto.randomUUID(), admin.id, id, JSON.stringify({ code, name, monthlyPriceCents, currency, seatLimit, storageLimitMb })),
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE")) return { error: "Plan code already exists." };
      throw error;
    }
    return { saved: true, message: "Workspace plan created." };
  }

  if (intent === "create-workspace") {
    const name = formText(form.get("name")).trim();
    const slug = normalizeWorkspaceSlug(formText(form.get("slug")) || name);
    const ownerUserId = formText(form.get("ownerUserId")).trim();
    const billingEmail = normalizeEmail(form.get("billingEmail"));
    const primaryProjectId = formText(form.get("primaryProjectId")).trim() || null;
    const planId = formText(form.get("planId")).trim() || "plan-house-internal";
    const trialEndsAt = dateValue(form.get("trialEndsAt"));
    if (name.length < 2 || name.length > 120 || !slug || !ownerUserId || trialEndsAt === undefined)
      return { error: "Check the workspace name, slug and owner." };
    if (billingEmail && !validateEmail(billingEmail)) return { error: "Enter a valid billing email." };
    const [owner, plan] = await Promise.all([
      db.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'active'").bind(ownerUserId).first(),
      db.prepare("SELECT 1 FROM saas_plans WHERE id = ? AND status = 'active'").bind(planId).first(),
    ]);
    if (!owner || !plan) return { error: "Choose an active owner and plan." };
    const workspaceId = crypto.randomUUID();
    const statements = [
      db
        .prepare(
          `INSERT INTO saas_workspaces
           (id, slug, name, status, owner_user_id, primary_project_id, billing_email, created_by, updated_by)
           VALUES (?, ?, ?, 'trial', ?, ?, ?, ?, ?)`,
        )
        .bind(workspaceId, slug, name, ownerUserId, primaryProjectId, billingEmail, admin.id, admin.id),
      db
        .prepare(
          `INSERT INTO saas_workspace_members
           (workspace_id, user_id, role, status, invited_by) VALUES (?, ?, 'owner', 'active', ?)`,
        )
        .bind(workspaceId, ownerUserId, admin.id),
      db
        .prepare(
          `INSERT INTO saas_workspace_subscriptions
           (workspace_id, plan_id, status, trial_ends_at, updated_by) VALUES (?, ?, 'trialing', ?, ?)`,
        )
        .bind(workspaceId, planId, trialEndsAt, admin.id),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'saas_workspace.created', 'saas_workspace', ?, ?)`,
        )
        .bind(crypto.randomUUID(), admin.id, workspaceId, JSON.stringify({ slug, ownerUserId, planId, primaryProjectId })),
    ];
    if (primaryProjectId)
      statements.push(
        db.prepare("INSERT INTO saas_workspace_project_links (workspace_id, project_id, linked_by) VALUES (?, ?, ?)").bind(workspaceId, primaryProjectId, admin.id),
      );
    try {
      await db.batch(statements);
    } catch (error) {
      if (String(error).includes("UNIQUE")) return { error: "Workspace slug already exists." };
      throw error;
    }
    return { saved: true, message: "Workspace provisioned with an isolated member roster and subscription." };
  }

  const workspaceId = formText(form.get("workspaceId")).trim();
  if (!workspaceId) return { error: "Workspace reference is missing." };
  const workspace = await db.prepare("SELECT id, owner_user_id AS ownerUserId FROM saas_workspaces WHERE id = ?").bind(workspaceId).first<{ id: string; ownerUserId: string }>();
  if (!workspace) throw new Response("Workspace not found.", { status: 404 });

  if (intent === "update-workspace") {
    const status = formText(form.get("status"));
    const billingEmail = normalizeEmail(form.get("billingEmail"));
    const brandName = formText(form.get("brandName")).trim().slice(0, 120);
    const primaryProjectId = formText(form.get("primaryProjectId")).trim() || null;
    if (!isWorkspaceStatus(status) || (billingEmail && !validateEmail(billingEmail)))
      return { error: "Check workspace status and billing email." };
    await db.batch([
      db
        .prepare("UPDATE saas_workspaces SET status = ?, billing_email = ?, brand_name = ?, primary_project_id = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(status, billingEmail, brandName, primaryProjectId, admin.id, workspaceId),
      db
        .prepare("INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json) VALUES (?, ?, 'saas_workspace.updated', 'saas_workspace', ?, ?)")
        .bind(crypto.randomUUID(), admin.id, workspaceId, JSON.stringify({ status, primaryProjectId })),
    ]);
    return { saved: true, message: "Workspace updated." };
  }

  if (intent === "update-subscription") {
    const planId = formText(form.get("planId")).trim();
    const status = formText(form.get("status"));
    const trialEndsAt = dateValue(form.get("trialEndsAt"));
    const periodStart = dateValue(form.get("periodStart"));
    const periodEnd = dateValue(form.get("periodEnd"));
    const externalReference = formText(form.get("externalReference")).trim().slice(0, 300);
    const seatOverrideRaw = formText(form.get("seatLimitOverride")).trim();
    const storageOverrideRaw = formText(form.get("storageLimitMbOverride")).trim();
    const seatOverride = seatOverrideRaw ? integer(form.get("seatLimitOverride")) : null;
    const storageOverride = storageOverrideRaw ? integer(form.get("storageLimitMbOverride")) : null;
    if (!planId || !isSubscriptionStatus(status) || trialEndsAt === undefined || periodStart === undefined || periodEnd === undefined || (seatOverrideRaw && !seatOverride) || (storageOverrideRaw && !storageOverride))
      return { error: "Check subscription status, dates and overrides." };
    const plan = await db.prepare("SELECT 1 FROM saas_plans WHERE id = ?").bind(planId).first();
    if (!plan) return { error: "Plan not found." };
    await db
      .prepare(
        `INSERT INTO saas_workspace_subscriptions
         (workspace_id, plan_id, status, trial_ends_at, current_period_start, current_period_end,
          external_billing_reference, seat_limit_override, storage_limit_mb_override, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(workspace_id) DO UPDATE SET plan_id = excluded.plan_id,
           status = excluded.status, trial_ends_at = excluded.trial_ends_at,
           current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
           external_billing_reference = excluded.external_billing_reference,
           seat_limit_override = excluded.seat_limit_override,
           storage_limit_mb_override = excluded.storage_limit_mb_override,
           updated_by = excluded.updated_by, updated_at = datetime('now')`,
      )
      .bind(workspaceId, planId, status, trialEndsAt, periodStart, periodEnd, externalReference, seatOverride, storageOverride, admin.id)
      .run();
    return { saved: true, message: "Subscription controls updated." };
  }

  if (intent === "set-entitlement") {
    const moduleKey = formText(form.get("moduleKey"));
    const enabled = formText(form.get("enabled")) === "1" ? 1 : 0;
    if (!isWorkspaceModule(moduleKey)) return { error: "Unknown workspace module." };
    await db
      .prepare(
        `INSERT INTO saas_workspace_module_entitlements
         (workspace_id, module_key, enabled, updated_by, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(workspace_id, module_key) DO UPDATE SET enabled = excluded.enabled,
           updated_by = excluded.updated_by, updated_at = datetime('now')`,
      )
      .bind(workspaceId, moduleKey, enabled, admin.id)
      .run();
    return { saved: true, message: "Module entitlement overridden." };
  }

  if (intent === "add-member") {
    const userId = formText(form.get("userId")).trim();
    const role = formText(form.get("role"));
    if (!userId || !isWorkspaceRole(role)) return { error: "Choose a user and workspace role." };
    const effective = await loadWorkspaceEntitlements(db, workspaceId);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM saas_workspace_members WHERE workspace_id = ? AND status = 'active'").bind(workspaceId).first<{ count: number }>();
    const existing = await db.prepare("SELECT status FROM saas_workspace_members WHERE workspace_id = ? AND user_id = ?").bind(workspaceId, userId).first<{ status: string }>();
    if ((!existing || existing.status !== "active") && Number(count?.count ?? 0) >= effective.seatLimit)
      return { error: "Seat limit reached. Increase the subscription seat limit before adding this member." };
    await db
      .prepare(
        `INSERT INTO saas_workspace_members (workspace_id, user_id, role, status, invited_by, updated_at)
         VALUES (?, ?, ?, 'active', ?, datetime('now'))
         ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role, status = 'active', updated_at = datetime('now')`,
      )
      .bind(workspaceId, userId, role, admin.id)
      .run();
    return { saved: true, message: "Workspace member added." };
  }

  if (intent === "update-member") {
    const userId = formText(form.get("userId")).trim();
    const role = formText(form.get("role"));
    const status = formText(form.get("status"));
    if (!userId || !isWorkspaceRole(role) || !["active", "suspended"].includes(status))
      return { error: "Check the member role and status." };
    if (userId === workspace.ownerUserId && (role !== "owner" || status !== "active"))
      return { error: "Workspace owner must remain an active owner. Transfer ownership before changing this member." };
    await db.prepare("UPDATE saas_workspace_members SET role = ?, status = ?, updated_at = datetime('now') WHERE workspace_id = ? AND user_id = ?").bind(role, status, workspaceId, userId).run();
    return { saved: true, message: "Workspace member updated." };
  }

  if (intent === "record-invite") {
    const email = normalizeEmail(form.get("email"));
    const role = formText(form.get("role"));
    const expiresAt = dateValue(form.get("expiresAt"));
    if (!validateEmail(email) || !isWorkspaceRole(role) || role === "owner" || expiresAt === undefined)
      return { error: "Enter a valid invite email, role and expiry." };
    await db
      .prepare("INSERT INTO saas_workspace_invitations (id, workspace_id, email, role, expires_at, invited_by) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), workspaceId, email, role, expiresAt, admin.id)
      .run();
    return { saved: true, message: "Invitation is tracked. No email is sent automatically in this release." };
  }

  if (intent === "update-invite") {
    const inviteId = formText(form.get("inviteId")).trim();
    const status = formText(form.get("status"));
    if (!inviteId || !["pending", "accepted", "revoked", "expired"].includes(status))
      return { error: "Choose a valid invitation stage." };
    await db.prepare("UPDATE saas_workspace_invitations SET status = ?, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?").bind(status, inviteId, workspaceId).run();
    return { saved: true, message: "Invitation tracking updated." };
  }

  if (intent === "link-project") {
    const projectId = formText(form.get("projectId")).trim();
    if (!projectId) return { error: "Choose a Project to link." };
    await db.prepare("INSERT OR IGNORE INTO saas_workspace_project_links (workspace_id, project_id, linked_by) VALUES (?, ?, ?)").bind(workspaceId, projectId, admin.id).run();
    return { saved: true, message: "Project linked to workspace." };
  }

  if (intent === "unlink-project") {
    const projectId = formText(form.get("projectId")).trim();
    await db.prepare("DELETE FROM saas_workspace_project_links WHERE workspace_id = ? AND project_id = ?").bind(workspaceId, projectId).run();
    return { saved: true, message: "Project unlinked from workspace." };
  }

  return { error: "Unsupported workspace action." };
}

export default function AdminSaasWorkspaces({ loaderData, actionData }: Route.ComponentProps) {
  const pending = useNavigation().state !== "idle";
  const [, setSearchParams] = useSearchParams();
  const selected = loaderData.selected;
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <AdminWorkspaceNav access={loaderData.access} />
        <header className="directory-heading"><div><span className="eyebrow">SaaS administration</span><h1>Provision and govern AKARI workspaces.</h1><p>Tenant roster, plan, subscription, module and Project-link control without exposing House-wide internal data.</p></div></header>
        {actionData?.error && <p className="notice error" role="alert">{actionData.error}</p>}
        {actionData?.saved && <p className="notice success" role="status">{actionData.message}</p>}

        <section className="status-card"><div className="section-heading"><div><span className="chapter">Provision</span><h2>Create workspace</h2></div></div>
          <Form method="post" className="profile-form"><input type="hidden" name="intent" value="create-workspace" /><div className="form-grid two-column-grid">
            <label>Name<input name="name" maxLength={120} required /></label><label>Slug<input name="slug" maxLength={80} placeholder="generated from name" /></label>
            <label>Owner<select name="ownerUserId" defaultValue="" required><option value="" disabled>Select owner</option>{loaderData.users.map((u) => <option key={u.id} value={u.id}>{u.label} · {u.email}</option>)}</select></label>
            <label>Billing email<input name="billingEmail" type="email" /></label>
            <label>Primary Project<select name="primaryProjectId" defaultValue=""><option value="">None</option>{loaderData.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
            <label>Plan<select name="planId" defaultValue="plan-house-internal">{loaderData.plans.filter((p) => p.status === "active").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Trial ends<input name="trialEndsAt" type="date" /></label>
          </div><button className="primary-action" disabled={pending}>Create workspace</button></Form>
        </section>

        <section className="status-card"><div className="section-heading"><div><span className="chapter">Plans</span><h2>Create commercial plan</h2></div><p>Pricing is admin-defined. No payment processor is implied.</p></div>
          <Form method="post" className="profile-form"><input type="hidden" name="intent" value="create-plan" /><div className="form-grid two-column-grid"><label>Code<input name="code" maxLength={50} required /></label><label>Name<input name="name" maxLength={100} required /></label><label>Monthly price<input name="monthlyPrice" inputMode="decimal" defaultValue="0.00" required /></label><label>Currency<input name="currency" defaultValue="USD" maxLength={12} required /></label><label>Seat limit<input name="seatLimit" type="number" min={1} defaultValue={5} required /></label><label>Storage limit MB<input name="storageLimitMb" type="number" min={1} defaultValue={1024} required /></label></div><div className="chip-list">{workspaceModules.map((module) => <label className="checkbox-row" key={module}><input type="checkbox" name={`module_${module}`} value="1" /> {workspaceModuleLabels[module]}</label>)}</div><button className="primary-action" disabled={pending}>Create plan</button></Form>
          <div className="table-scroll"><table className="admin-table"><thead><tr><th>Plan</th><th>Price</th><th>Seats</th><th>Storage</th><th>Status</th></tr></thead><tbody>{loaderData.plans.map((p) => <tr key={p.id}><td>{p.name}<br /><small>{p.code}</small></td><td>{moneyLabel(p.monthlyPriceCents, p.currency)}/mo</td><td>{p.seatLimit}</td><td>{p.storageLimitMb} MB</td><td>{p.status}</td></tr>)}</tbody></table></div>
        </section>

        <section className="status-card"><div className="section-heading"><div><span className="chapter">Workspace register</span><h2>{loaderData.workspaces.length} workspaces</h2></div></div>
          <div className="table-scroll"><table className="admin-table"><thead><tr><th>Workspace</th><th>Owner</th><th>Project</th><th>Plan</th><th>Seats</th><th>Status</th><th>Open</th></tr></thead><tbody>{loaderData.workspaces.map((w) => <tr key={w.id}><td><strong>{w.name}</strong><br /><small>{w.slug}</small></td><td>{w.ownerName}</td><td>{w.projectTitle ?? "None"}</td><td>{w.planName ?? "Unconfigured"}<br /><small>{w.subscriptionStatus ?? ""}</small></td><td>{w.memberCount}</td><td>{w.status}</td><td><button type="button" onClick={() => setSearchParams({ workspace: w.id })}>Manage</button> <Link to={`/workspaces/${w.slug}`}>Workspace</Link></td></tr>)}</tbody></table></div>
        </section>

        {selected && <>
          <section className="status-card"><div className="section-heading"><div><span className="chapter">Selected workspace</span><h2>{selected.name}</h2></div><Link to={`/workspaces/${selected.slug}`}>Open member shell</Link></div>
            <Form method="post" className="profile-form"><input type="hidden" name="intent" value="update-workspace" /><input type="hidden" name="workspaceId" value={selected.id} /><div className="form-grid two-column-grid"><label>Status<select name="status" defaultValue={selected.status}>{workspaceStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</select></label><label>Billing email<input name="billingEmail" type="email" defaultValue={selected.billingEmail} /></label><label>Brand name<input name="brandName" maxLength={120} defaultValue={selected.brandName} /></label><label>Primary Project<select name="primaryProjectId" defaultValue={selected.primaryProjectId ?? ""><option value="">None</option>{loaderData.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label></div><button disabled={pending}>Save workspace</button></Form>
          </section>

          <section className="status-card"><div className="section-heading"><div><span className="chapter">Subscription</span><h2>{loaderData.entitlements?.planName}</h2></div><p>{loaderData.members.length}/{loaderData.entitlements?.seatLimit ?? 0} active roster entries · storage limit is configured, current storage is not fabricated until R2 objects are workspace-attributable.</p></div>
            <Form method="post" className="profile-form"><input type="hidden" name="intent" value="update-subscription" /><input type="hidden" name="workspaceId" value={selected.id} /><div className="form-grid two-column-grid"><label>Plan<select name="planId" defaultValue={selected.planId ?? "plan-house-internal"}>{loaderData.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Status<select name="status" defaultValue={selected.subscriptionStatus ?? "trialing"}>{subscriptionStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</select></label><label>Trial ends<input name="trialEndsAt" type="date" defaultValue={selected.trialEndsAt?.slice(0, 10) ?? ""} /></label><label>Period start<input name="periodStart" type="date" /></label><label>Period end<input name="periodEnd" type="date" defaultValue={selected.currentPeriodEnd?.slice(0, 10) ?? ""} /></label><label>External billing reference<input name="externalReference" maxLength={300} /></label><label>Seat override<input name="seatLimitOverride" type="number" min={1} /></label><label>Storage MB override<input name="storageLimitMbOverride" type="number" min={1} /></label></div><button disabled={pending}>Save subscription</button></Form>
            <div className="chip-list">{workspaceModules.map((module) => <Form method="post" className="inline-form" key={module}><input type="hidden" name="intent" value="set-entitlement" /><input type="hidden" name="workspaceId" value={selected.id} /><input type="hidden" name="moduleKey" value={module} /><span>{workspaceModuleLabels[module]}: <strong>{loaderData.entitlements?.modules[module] ? "On" : "Off"}</strong></span><select name="enabled" defaultValue={loaderData.entitlements?.modules[module] ? "1" : "0"}><option value="1">On</option><option value="0">Off</option></select><button disabled={pending}>Override</button></Form>)}</div>
          </section>

          <section className="status-card"><div className="section-heading"><div><span className="chapter">Team</span><h2>Workspace roster</h2></div></div>
            <Form method="post" className="inline-form"><input type="hidden" name="intent" value="add-member" /><input type="hidden" name="workspaceId" value={selected.id} /><select name="userId" defaultValue="" required><option value="" disabled>Add existing user</option>{loaderData.users.map((u) => <option key={u.id} value={u.id}>{u.label} · {u.email}</option>)}</select><select name="role" defaultValue="member">{workspaceRoles.map((r) => <option key={r} value={r}>{r}</option>)}</select><button disabled={pending}>Add member</button></Form>
            <div className="table-scroll"><table className="admin-table"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Update</th></tr></thead><tbody>{loaderData.members.map((m) => <tr key={m.userId}><td>{m.label}<br /><small>{m.email}</small></td><td colSpan={3}><Form method="post" className="inline-form"><input type="hidden" name="intent" value="update-member" /><input type="hidden" name="workspaceId" value={selected.id} /><input type="hidden" name="userId" value={m.userId} /><select name="role" defaultValue={m.role}>{workspaceRoles.map((r) => <option key={r} value={r}>{r}</option>)}</select><select name="status" defaultValue={m.status}><option value="active">active</option><option value="suspended">suspended</option></select><button disabled={pending}>Save</button></Form></td></tr>)}</tbody></table></div>
            <h3>Invitation tracking</h3><p>This records pending invitations only. It does not pretend an email/token delivery system exists.</p><Form method="post" className="inline-form"><input type="hidden" name="intent" value="record-invite" /><input type="hidden" name="workspaceId" value={selected.id} /><input name="email" type="email" placeholder="name@company.com" required /><select name="role" defaultValue="member"><option value="member">member</option><option value="finance">finance</option><option value="admin">admin</option></select><input name="expiresAt" type="date" /><button disabled={pending}>Track invitation</button></Form>
            {loaderData.invites.map((invite) => <Form method="post" className="inline-form" key={invite.id}><input type="hidden" name="intent" value="update-invite" /><input type="hidden" name="workspaceId" value={selected.id} /><input type="hidden" name="inviteId" value={invite.id} /><span>{invite.email} · {invite.role}</span><select name="status" defaultValue={invite.status}><option value="pending">pending</option><option value="accepted">accepted</option><option value="revoked">revoked</option><option value="expired">expired</option></select><button disabled={pending}>Save</button></Form>)}
          </section>

          <section className="status-card"><div className="section-heading"><div><span className="chapter">Project boundary</span><h2>Linked Projects</h2></div></div><Form method="post" className="inline-form"><input type="hidden" name="intent" value="link-project" /><input type="hidden" name="workspaceId" value={selected.id} /><select name="projectId" defaultValue="" required><option value="" disabled>Select Project</option>{loaderData.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select><button disabled={pending}>Link Project</button></Form>{loaderData.linkedProjects.map((p) => <Form method="post" className="inline-form" key={p.id}><input type="hidden" name="intent" value="unlink-project" /><input type="hidden" name="workspaceId" value={selected.id} /><input type="hidden" name="projectId" value={p.id} /><span>{p.title}</span><button disabled={pending}>Unlink</button></Form>)}</section>
        </>}
      </main>
    </div>
  );
}
