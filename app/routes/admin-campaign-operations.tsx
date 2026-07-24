import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin-campaign-operations";
import { SiteHeader } from "~/components/SiteHeader";
import { ensureCampaignOperationsSchema } from "~/lib/campaign-operations-schema.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "campaigns");
  await ensureCampaignOperationsSchema(db);
  const [campaigns, admins, workload] = await Promise.all([
    db.prepare(
      `SELECT c.id, c.slug, c.title, c.status,
              o.primary_moderator_id AS primaryModeratorId,
              o.backup_moderator_id AS backupModeratorId,
              o.escalation_status AS escalationStatus,
              o.internal_notes AS internalNotes
       FROM ambassador_campaigns c
       LEFT JOIN campaign_ownership o ON o.campaign_id = c.id
       ORDER BY c.updated_at DESC`,
    ).all<{
      id: string;
      slug: string;
      title: string;
      status: string;
      primaryModeratorId: string | null;
      backupModeratorId: string | null;
      escalationStatus: string | null;
      internalNotes: string | null;
    }>(),
    db.prepare(
      `SELECT DISTINCT u.id, u.username, p.display_name AS displayName
       FROM admin_users au
       JOIN users u ON u.id = au.user_id
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN admin_scopes s ON s.admin_user_id = au.user_id
       WHERE au.access_level = 'superadmin' OR s.scope = 'campaigns'
       ORDER BY p.display_name`,
    ).all<{ id: string; username: string; displayName: string }>(),
    db.prepare(
      `SELECT u.id, p.display_name AS displayName,
              SUM(CASE WHEN o.primary_moderator_id = u.id THEN 1 ELSE 0 END) AS primaryCount,
              SUM(CASE WHEN o.backup_moderator_id = u.id THEN 1 ELSE 0 END) AS backupCount
       FROM admin_users au
       JOIN users u ON u.id = au.user_id
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN campaign_ownership o
         ON o.primary_moderator_id = u.id OR o.backup_moderator_id = u.id
       GROUP BY u.id ORDER BY primaryCount DESC, backupCount DESC`,
    ).all<{
      id: string;
      displayName: string;
      primaryCount: number;
      backupCount: number;
    }>(),
  ]);
  return {
    user,
    campaigns: campaigns.results,
    admins: admins.results,
    workload: workload.results,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdminScope(request, db, "campaigns");
  await ensureCampaignOperationsSchema(db);
  const form = await request.formData();
  const campaignId = formText(form.get("campaignId"));
  const primaryModeratorId = formText(form.get("primaryModeratorId")) || null;
  const backupModeratorId = formText(form.get("backupModeratorId")) || null;
  const escalationStatus = formText(form.get("escalationStatus"));
  const internalNotes = formText(form.get("internalNotes")).slice(0, 4000) || null;
  if (!campaignId || !["normal", "attention", "escalated"].includes(escalationStatus)) {
    return { error: "Campaign and escalation status are required." };
  }
  if (primaryModeratorId && primaryModeratorId === backupModeratorId) {
    return { error: "Primary and backup moderators must be different people." };
  }
  await db.batch([
    db.prepare(
      `INSERT INTO campaign_ownership
       (campaign_id, primary_moderator_id, backup_moderator_id,
        escalation_status, internal_notes, assigned_by, assigned_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(campaign_id) DO UPDATE SET
         primary_moderator_id = excluded.primary_moderator_id,
         backup_moderator_id = excluded.backup_moderator_id,
         escalation_status = excluded.escalation_status,
         internal_notes = excluded.internal_notes,
         assigned_by = excluded.assigned_by,
         assigned_at = datetime('now'),
         updated_at = datetime('now')`,
    ).bind(
      campaignId,
      primaryModeratorId,
      backupModeratorId,
      escalationStatus,
      internalNotes,
      admin.id,
    ),
    db.prepare(
      `INSERT INTO campaign_assignment_history
       (id, campaign_id, primary_moderator_id, backup_moderator_id,
        escalation_status, note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      campaignId,
      primaryModeratorId,
      backupModeratorId,
      escalationStatus,
      internalNotes,
      admin.id,
    ),
    db.prepare(
      `INSERT INTO audit_logs
       (id, actor_user_id, action, subject_type, subject_id, metadata_json)
       VALUES (?, ?, 'campaign.ownership_updated', 'campaign', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      admin.id,
      campaignId,
      JSON.stringify({ primaryModeratorId, backupModeratorId, escalationStatus }),
    ),
  ]);
  throw redirect("/admin/campaign-operations?saved=1");
}

export default function AdminCampaignOperations({ loaderData, actionData }: Route.ComponentProps) {
  const adminName = new Map(loaderData.admins.map((item) => [item.id, item.displayName]));
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Campaign operations</span>
            <h1>Ownership, workload and escalation</h1>
            <p>Assign accountable moderators and preserve every operational change.</p>
          </div>
          <Link className="button button-quiet" to="/admin/campaigns">Campaign control</Link>
        </header>
        {actionData?.error && <p className="form-error" role="alert">{actionData.error}</p>}
        <section className="admin-panel">
          <h2>Moderator workload</h2>
          <div className="member-home-stats">
            {loaderData.workload.map((item) => (
              <article key={item.id}>
                <strong>{item.primaryCount} / {item.backupCount}</strong>
                <span>{item.displayName} · primary / backup</span>
              </article>
            ))}
          </div>
        </section>
        <section className="application-list">
          {loaderData.campaigns.map((campaign) => (
            <article className="application-card" key={campaign.id}>
              <div>
                <span className="chapter">{campaign.status} · {campaign.escalationStatus ?? "normal"}</span>
                <h2>{campaign.title}</h2>
                <p>Primary: {campaign.primaryModeratorId ? adminName.get(campaign.primaryModeratorId) : "Unassigned"}</p>
                <p>Backup: {campaign.backupModeratorId ? adminName.get(campaign.backupModeratorId) : "Unassigned"}</p>
              </div>
              <Form method="post" className="form-stack">
                <input type="hidden" name="campaignId" value={campaign.id} />
                <label>Primary moderator<select name="primaryModeratorId" defaultValue={campaign.primaryModeratorId ?? ""}><option value="">Unassigned</option>{loaderData.admins.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
                <label>Backup moderator<select name="backupModeratorId" defaultValue={campaign.backupModeratorId ?? ""}><option value="">Unassigned</option>{loaderData.admins.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
                <label>Escalation<select name="escalationStatus" defaultValue={campaign.escalationStatus ?? "normal"}><option value="normal">Normal</option><option value="attention">Needs attention</option><option value="escalated">Escalated</option></select></label>
                <label>Internal notes<textarea name="internalNotes" maxLength={4000} defaultValue={campaign.internalNotes ?? ""} /></label>
                <button className="button button-primary" type="submit">Save ownership</button>
              </Form>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
