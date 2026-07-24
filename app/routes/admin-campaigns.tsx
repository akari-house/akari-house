import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin-campaigns";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  dailyEngagementRequirement,
  postingCadences,
} from "~/lib/campaign-delivery";
import { requireAdminScope } from "~/lib/membership.server";
import { slugifyProject } from "~/lib/projects.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

async function uniqueSlug(db: D1Database, title: string) {
  const base = slugifyProject(title) || "iio";
  for (let suffix = 0; suffix < 30; suffix += 1) {
    const slug = suffix ? `${base}-${suffix + 1}` : base;
    if (
      !(await db
        .prepare("SELECT 1 FROM ambassador_campaigns WHERE slug = ?")
        .bind(slug)
        .first())
    )
      return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "campaigns");
  const [campaigns, projects] = await Promise.all([
    db
      .prepare(
        `SELECT c.id, c.slug, c.title, c.summary, c.status, c.campaign_kind AS campaignKind,
                c.application_deadline AS applicationDeadline,
                c.budget_cents AS budgetCents, c.currency,
                COUNT(ca.id) AS applicationCount,
                SUM(CASE WHEN ca.status = 'accepted' THEN 1 ELSE 0 END) AS finalistCount,
                p.title AS projectTitle, pr.display_name AS founderName
         FROM ambassador_campaigns c
         JOIN projects p ON p.id = c.project_id
         JOIN profiles pr ON pr.user_id = c.created_by
         LEFT JOIN campaign_applications ca ON ca.campaign_id = c.id
         GROUP BY c.id
         ORDER BY c.updated_at DESC`,
      )
      .all<{
        id: string;
        slug: string;
        title: string;
        summary: string;
        status: string;
        campaignKind: string;
        applicationDeadline: string | null;
        budgetCents: number;
        currency: string;
        applicationCount: number;
        finalistCount: number;
        projectTitle: string;
        founderName: string;
      }>(),
    db
      .prepare(
        `SELECT id, title FROM projects
         WHERE status = 'published' ORDER BY title`,
      )
      .all<{ id: string; title: string }>(),
  ]);
  return {
    user,
    campaigns: campaigns.results,
    projects: projects.results,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdminScope(request, db, "campaigns");
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "create-iio") {
    const projectId = formText(form.get("projectId"));
    const title = formText(form.get("title")).trim();
    const summary = formText(form.get("summary")).trim();
    const brief = formText(form.get("brief")).trim();
    const deliverables = formText(form.get("deliverables")).trim();
    const applicationDeadline = formText(
      form.get("applicationDeadline"),
    ).trim();
    const registrationOpensAt = formText(
      form.get("registrationOpensAt"),
    ).trim();
    const startsAt = formText(form.get("startsAt")).trim();
    const endsAt = formText(form.get("endsAt")).trim();
    const dailyEngagementConfirmed =
      form.get("dailyEngagement") === "required";
    const postingCadence = formText(form.get("postingCadence"));
    const budget = Number(formText(form.get("budget")));
    const followers = Number(formText(form.get("weightFollowers")));
    const xScore = Number(formText(form.get("weightXScore")));
    const sorsaScore = Number(formText(form.get("weightSorsaScore")));
    if (
      title.length < 5 ||
      title.length > 120 ||
      summary.length < 20 ||
      summary.length > 300 ||
      brief.length < 50 ||
      brief.length > 5000 ||
      deliverables.length < 10 ||
      deliverables.length > 1500 ||
      !Number.isFinite(budget) ||
      budget <= 0 ||
      ![followers, xScore, sorsaScore].every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 100,
      ) ||
      followers + xScore + sorsaScore !== 100 ||
      !dailyEngagementConfirmed ||
      !postingCadences.some((item) => item.value === postingCadence) ||
      !registrationOpensAt ||
      !applicationDeadline ||
      !startsAt ||
      !endsAt ||
      !(
        registrationOpensAt <= applicationDeadline &&
        applicationDeadline < startsAt &&
        startsAt <= endsAt
      )
    )
      return {
        error:
          "Complete the IIO brief, confirm mandatory daily engagement, select a posting cadence, add a positive private budget, and make the three weights total 100.",
      };
    const project = await db
      .prepare("SELECT id FROM projects WHERE id = ? AND status = 'published'")
      .bind(projectId)
      .first();
    if (!project) return { error: "Choose a published project." };
    const id = crypto.randomUUID();
    const slug = await uniqueSlug(db, title);
    await db.batch([
      db
        .prepare(
          `INSERT INTO ambassador_campaigns
           (id, project_id, created_by, slug, title, summary, brief,
            deliverables, compensation, application_deadline, status,
            campaign_kind, budget_cents, currency, weight_followers,
            weight_x_score, weight_sorsa_score, registration_opens_at,
            starts_at, ends_at, posting_cadence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'draft',
                   'iio', ?, 'USD', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          projectId,
          admin.id,
          slug,
          title,
          summary,
          brief,
          deliverables,
          applicationDeadline,
          Math.round(budget * 100),
          followers,
          xScore,
          sorsaScore,
          registrationOpensAt,
          startsAt,
          endsAt,
          postingCadence,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id)
           VALUES (?, ?, 'iio.created', 'campaign', ?)`,
        )
        .bind(crypto.randomUUID(), admin.id, id),
    ]);
    throw redirect(`/admin/iio/${slug}`);
  }

  const campaignId = formText(form.get("campaignId"));
  const decisionNote = formText(form.get("decisionNote")).trim();
  if (
    !["publish", "decline"].includes(intent) ||
    decisionNote.length < 5 ||
    decisionNote.length > 500
  )
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

export default function AdminCampaigns({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">IIO control room</span>
            <h1>Campaigns, selection and distribution.</h1>
            <p>
              Budgets remain private. Only finalized Creators see their own
              allocation.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin/team">
            Admin permissions
          </Link>
        </header>
        {actionData?.error && <p className="form-error">{actionData.error}</p>}
        {actionData?.saved && (
          <p className="notice success">Campaign decision saved.</p>
        )}
        <section className="admin-panel">
          <span className="chapter">Create an Initial Interest Offering</span>
          <h2>Open a private-budget Creator campaign.</h2>
          <Form method="post" className="profile-form">
            <input type="hidden" name="intent" value="create-iio" />
            <label>
              Project
              <select name="projectId" required defaultValue="">
                <option value="" disabled>
                  Choose a published project
                </option>
                {loaderData.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              IIO title
              <input name="title" minLength={5} maxLength={120} required />
            </label>
            <label>
              Public summary
              <textarea
                name="summary"
                minLength={20}
                maxLength={300}
                rows={3}
                required
              />
            </label>
            <label>
              Campaign story and terms
              <textarea
                name="brief"
                minLength={50}
                maxLength={5000}
                rows={8}
                required
              />
            </label>
            <label>
              Creator deliverables
              <textarea
                name="deliverables"
                minLength={10}
                maxLength={1500}
                rows={5}
                required
              />
            </label>
            <div className="form-row">
              <label>
                Private total budget (USD)
                <input
                  name="budget"
                  type="number"
                  min="1"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Registration opens
                <input name="registrationOpensAt" type="date" required />
              </label>
            </div>
            <div className="form-row form-row-three">
              <label>
                Registration closes
                <input name="applicationDeadline" type="date" required />
              </label>
              <label>
                Campaign starts
                <input name="startsAt" type="date" required />
              </label>
              <label>
                Campaign ends
                <input name="endsAt" type="date" required />
              </label>
            </div>
            <fieldset>
              <legend>Creator commitments</legend>
              <label className="inline-choice">
                <input
                  name="dailyEngagement"
                  type="checkbox"
                  value="required"
                  defaultChecked
                  required
                />
                <span>
                  <strong>{dailyEngagementRequirement.label}</strong>
                  <small>{dailyEngagementRequirement.detail}</small>
                </span>
              </label>
              <label>
                Posting cadence
                <select name="postingCadence" defaultValue="weekly_3" required>
                  {postingCadences.map((cadence) => (
                    <option key={cadence.value} value={cadence.value}>
                      {cadence.label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <fieldset>
              <legend>AKARI score weights (must total 100)</legend>
              <div className="form-row form-row-three">
                <label>
                  X followers %
                  <input
                    name="weightFollowers"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="40"
                    required
                  />
                </label>
                <label>
                  XScore %
                  <input
                    name="weightXScore"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="30"
                    required
                  />
                </label>
                <label>
                  Sorsa score %
                  <input
                    name="weightSorsaScore"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="30"
                    required
                  />
                </label>
              </div>
            </fieldset>
            <button
              className="button button-primary"
              disabled={navigation.state !== "idle"}
            >
              Create private draft
            </button>
          </Form>
        </section>
        <section className="application-list">
          <header>
            <span className="eyebrow">All campaigns</span>
            <h2>Review and execute.</h2>
          </header>
          {loaderData.campaigns.map((campaign) => (
            <article className="application-card" key={campaign.id}>
              <div>
                <span className="chapter">
                  {campaign.campaignKind === "iio" ? "IIO" : "Campaign"} ·{" "}
                  {campaign.status}
                </span>
                <h3>{campaign.title}</h3>
                <p>
                  {campaign.projectTitle} · {campaign.applicationCount}{" "}
                  applications · {campaign.finalistCount} selected
                </p>
              </div>
              {campaign.campaignKind === "iio" ? (
                <Link
                  className="button button-primary"
                  to={`/admin/iio/${campaign.slug}`}
                >
                  Execute IIO
                </Link>
              ) : campaign.status === "submitted" ? (
                <Form method="post" className="application-actions">
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <label>
                    Decision note
                    <textarea
                      name="decisionNote"
                      minLength={5}
                      maxLength={500}
                      required
                    />
                  </label>
                  <button
                    name="intent"
                    value="publish"
                    className="button button-primary"
                  >
                    Publish
                  </button>
                  <button
                    name="intent"
                    value="decline"
                    className="button button-quiet"
                  >
                    Decline
                  </button>
                </Form>
              ) : (
                <Link
                  className="button button-quiet"
                  to={`/campaigns/${campaign.slug}`}
                >
                  View campaign
                </Link>
              )}
            </article>
          ))}
          {!loaderData.campaigns.length && (
            <div className="status-card">
              <h2>No campaigns yet.</h2>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
