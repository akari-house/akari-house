import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/campaign-new";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { slugifyProject } from "~/lib/projects.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

async function ownedVerifiedProject(
  db: D1Database,
  userId: string,
  slug: string | undefined,
) {
  return db
    .prepare(
      `SELECT p.id, p.slug, p.title
       FROM projects p
       JOIN role_verifications rv
         ON rv.user_id = p.founder_user_id AND rv.role = 'founder'
       WHERE p.slug = ? AND p.founder_user_id = ?
         AND p.status = 'published' AND rv.status = 'verified'`,
    )
    .bind(slug, userId)
    .first<{ id: string; slug: string; title: string }>();
}

async function uniqueCampaignSlug(db: D1Database, title: string) {
  const base = slugifyProject(title) || "campaign";
  for (let suffix = 0; suffix < 20; suffix += 1) {
    const slug = suffix ? `${base}-${suffix + 1}` : base;
    const exists = await db
      .prepare("SELECT 1 FROM ambassador_campaigns WHERE slug = ?")
      .bind(slug)
      .first();
    if (!exists) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const project = await ownedVerifiedProject(db, user.id, params.slug);
  if (!project)
    throw new Response("A verified Founder and published project are required.", {
      status: 403,
    });
  return { user, project };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const project = await ownedVerifiedProject(db, user.id, params.slug);
  if (!project) throw new Response("Forbidden.", { status: 403 });
  const form = await request.formData();
  const title = formText(form.get("title")).trim();
  const summary = formText(form.get("summary")).trim();
  const brief = formText(form.get("brief")).trim();
  const deliverables = formText(form.get("deliverables")).trim();
  const compensation = formText(form.get("compensation")).trim();
  const applicationDeadline = formText(form.get("applicationDeadline")).trim();
  if (
    title.length < 5 ||
    title.length > 120 ||
    summary.length < 20 ||
    summary.length > 300 ||
    brief.length < 50 ||
    brief.length > 5000 ||
    deliverables.length < 10 ||
    deliverables.length > 1500 ||
    compensation.length < 3 ||
    compensation.length > 500
  )
    return { error: "Complete every campaign field within the stated limits." };
  const id = crypto.randomUUID();
  const slug = await uniqueCampaignSlug(db, title);
  await db.batch([
    db
      .prepare(
        `INSERT INTO ambassador_campaigns
         (id, project_id, created_by, slug, title, summary, brief,
          deliverables, compensation, application_deadline, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULLIF(?, ''), 'submitted')`,
      )
      .bind(
        id,
        project.id,
        user.id,
        slug,
        title,
        summary,
        brief,
        deliverables,
        compensation,
        applicationDeadline,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id)
         VALUES (?, ?, 'campaign.submitted', 'campaign', ?)`,
      )
      .bind(crypto.randomUUID(), user.id, id),
  ]);
  throw redirect(`/campaigns/${slug}?submitted=1`);
}

export default function CampaignNew({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <span className="eyebrow">Ambassador campaign · {loaderData.project.title}</span>
        <h1>Invite the right creators.</h1>
        <p>Every campaign is reviewed before creators can apply.</p>
        <Form method="post" className="profile-form">
          {actionData?.error && <p className="form-error">{actionData.error}</p>}
          <label>Campaign title<input name="title" minLength={5} maxLength={120} required /></label>
          <label>Short summary<textarea name="summary" minLength={20} maxLength={300} rows={3} required /></label>
          <label>Campaign brief<textarea name="brief" minLength={50} maxLength={5000} rows={9} required /></label>
          <label>Expected deliverables<textarea name="deliverables" minLength={10} maxLength={1500} rows={5} required /></label>
          <label>Compensation and terms<textarea name="compensation" minLength={3} maxLength={500} rows={3} required /></label>
          <label>Application deadline<input name="applicationDeadline" type="date" /></label>
          <button className="button button-primary" disabled={navigation.state !== "idle"}>
            Submit campaign for review
          </button>
        </Form>
      </main>
    </div>
  );
}
