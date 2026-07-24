import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-campaigns";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type CampaignReviewRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  createdAt: string;
  projectTitle: string;
  founderName: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "campaigns");
  const campaigns = await db
    .prepare(
      `SELECT c.id, c.slug, c.title, c.summary, c.created_at AS createdAt,
              p.title AS projectTitle, pr.display_name AS founderName
       FROM ambassador_campaigns c
       JOIN projects p ON p.id = c.project_id
       JOIN profiles pr ON pr.user_id = c.created_by
       WHERE c.status = 'submitted'
       ORDER BY c.created_at`,
    )
    .all<CampaignReviewRow>();
  return { user, campaigns: campaigns.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdminScope(request, db, "campaigns");
  const form = await request.formData();
  const campaignId = formText(form.get("campaignId"));
  const intent = formText(form.get("intent"));
  const decisionNote = formText(form.get("decisionNote")).trim();
  if (!["publish", "decline"].includes(intent) || decisionNote.length < 5 || decisionNote.length > 500)
    return { error: "Choose a decision and add a 5 to 500 character note." };
  const status = intent === "publish" ? "published" : "declined";
  await db.batch([
    db
      .prepare(
        `UPDATE ambassador_campaigns SET status = ?, reviewed_by = ?,
         reviewed_at = datetime('now'), decision_note = ?,
         updated_at = datetime('now')
         WHERE id = ? AND status = 'submitted'`,
      )
      .bind(status, admin.id, decisionNote, campaignId),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'campaign.reviewed', 'campaign', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        campaignId,
        JSON.stringify({ status, decisionNote }),
      ),
  ]);
  return { saved: true };
}

export default function AdminCampaigns({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div><span className="eyebrow">Campaign review</span><h1>Ambassador proposals</h1></div>
          <Link className="button button-quiet" to="/admin/verifications">Role verification</Link>
        </header>
        {actionData?.error && <p className="form-error">{actionData.error}</p>}
        {actionData?.saved && <p className="notice success">Campaign decision saved.</p>}
        <div className="application-list">
          {loaderData.campaigns.map((campaign) => (
            <article className="application-card" key={campaign.id}>
              <div><span className="chapter">{campaign.projectTitle}</span><h2><Link to={`/campaigns/${campaign.slug}`}>{campaign.title}</Link></h2><p>{campaign.summary}</p></div>
              <Form method="post" className="application-actions">
                <input type="hidden" name="campaignId" value={campaign.id} />
                <label>Decision note<textarea name="decisionNote" minLength={5} maxLength={500} required /></label>
                <button className="button button-primary" name="intent" value="publish" disabled={navigation.state !== "idle"}>Publish</button>
                <button className="button button-quiet" name="intent" value="decline" disabled={navigation.state !== "idle"}>Decline</button>
              </Form>
            </article>
          ))}
          {!loaderData.campaigns.length && <div className="status-card"><h2>No proposals waiting.</h2></div>}
        </div>
      </main>
    </div>
  );
}
