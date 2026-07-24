import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-new";
import { ProjectNeedsFieldset } from "~/components/projects/ProjectNeedsFieldset";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { projectSeekingFromForm } from "~/lib/project-needs";
import { hasRole, uniqueProjectSlug } from "~/lib/projects.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireApprovedMember(
    request,
    context.get(cloudflareContext).env.DB,
  );
  if (!hasRole(user, "founder"))
    throw new Response("Founder role required.", { status: 403 });
  return { user };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!hasRole(user, "founder"))
    throw new Response("Founder role required.", { status: 403 });
  const form = await request.formData();
  const title = formText(form.get("title")).trim();
  const summary = formText(form.get("summary")).trim();
  const description = formText(form.get("description")).trim();
  const seekingInput = projectSeekingFromForm(form);
  const stage = formText(form.get("stage"));
  if (seekingInput.error) return { error: seekingInput.error };
  if (
    title.length < 3 ||
    title.length > 100 ||
    summary.length < 20 ||
    summary.length > 280 ||
    description.length > 4000 ||
    seekingInput.value.length > 600 ||
    !["idea", "prototype", "early_revenue", "growth"].includes(stage)
  )
    return { error: "Check the project fields and length limits." };
  const id = crypto.randomUUID();
  const slug = await uniqueProjectSlug(db, title);
  await db.batch([
    db
      .prepare(
        `INSERT INTO projects
         (id, founder_user_id, slug, title, summary, description, stage,
          seeking, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
      )
      .bind(
        id,
        user.id,
        slug,
        title,
        summary,
        description,
        stage,
        seekingInput.value,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'project.submitted', 'project', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        id,
        JSON.stringify({ needs: seekingInput.needs }),
      ),
  ]);
  throw redirect(`/projects/${slug}?submitted=1`);
}

export default function ProjectNew({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <span className="eyebrow">Founder project desk</span>
        <h1>Light a project lantern.</h1>
        <p>
          Projects enter review before becoming discoverable across the House.
        </p>
        <Form method="post" className="profile-form">
          {actionData?.error && (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          )}
          <label>
            Project name
            <input name="title" minLength={3} maxLength={100} required />
          </label>
          <label>
            One clear summary
            <textarea
              name="summary"
              rows={3}
              minLength={20}
              maxLength={280}
              required
            />
          </label>
          <label>
            The fuller story
            <textarea name="description" rows={8} maxLength={4000} />
          </label>
          <label>
            Stage
            <select name="stage" defaultValue="idea">
              <option value="idea">Idea</option>
              <option value="prototype">Prototype</option>
              <option value="early_revenue">Early revenue</option>
              <option value="growth">Growth</option>
            </select>
          </label>
          <ProjectNeedsFieldset />
          <button
            className="button button-primary"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "idle"
              ? "Submit for review"
              : "Submitting project..."}
          </button>
        </Form>
      </main>
    </div>
  );
}
