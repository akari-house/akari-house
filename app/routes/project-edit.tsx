import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-edit";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const project = await db
    .prepare(
      `SELECT slug, title, summary, description, stage, seeking, status
       FROM projects WHERE slug = ? AND founder_user_id = ?`,
    )
    .bind(params.slug, user.id)
    .first<{
      slug: string;
      title: string;
      summary: string;
      description: string;
      stage: string;
      seeking: string;
      status: string;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  return { user, project };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const form = await request.formData();
  const title = formText(form.get("title")).trim();
  const summary = formText(form.get("summary")).trim();
  const description = formText(form.get("description")).trim();
  const seeking = formText(form.get("seeking")).trim();
  const stage = formText(form.get("stage"));
  const intent = formText(form.get("intent"));
  if (
    title.length < 3 ||
    title.length > 100 ||
    summary.length < 20 ||
    summary.length > 280 ||
    description.length > 4000 ||
    seeking.length > 300 ||
    !["idea", "prototype", "early_revenue", "growth"].includes(stage)
  )
    return { error: "Check the project fields and limits." };
  const current = await db
    .prepare(
      "SELECT id, status FROM projects WHERE slug = ? AND founder_user_id = ?",
    )
    .bind(params.slug, user.id)
    .first<{ id: string; status: string }>();
  if (!current) throw new Response("Project not found.", { status: 404 });
  const status =
    intent === "submit" && ["draft", "declined"].includes(current.status)
      ? "submitted"
      : current.status === "published"
        ? "submitted"
        : current.status;
  await db.batch([
    db
      .prepare(
        `UPDATE projects SET title = ?, summary = ?, description = ?,
         stage = ?, seeking = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(title, summary, description, stage, seeking, status, current.id),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id)
         VALUES (?, ?, 'project.updated', 'project', ?)`,
      )
      .bind(crypto.randomUUID(), user.id, current.id),
  ]);
  throw redirect(`/projects/${params.slug}`);
}

export default function ProjectEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const project = loaderData.project;
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <span className="eyebrow">Project editor · {project.status}</span>
        <h1>Refine the project story.</h1>
        <Form method="post" className="profile-form">
          {actionData?.error && <p className="form-error">{actionData.error}</p>}
          <label>
            Project name
            <input
              name="title"
              defaultValue={project.title}
              maxLength={100}
              required
            />
          </label>
          <label>
            Summary
            <textarea
              name="summary"
              defaultValue={project.summary}
              minLength={20}
              maxLength={280}
              rows={3}
              required
            />
          </label>
          <label>
            Full story
            <textarea
              name="description"
              defaultValue={project.description}
              maxLength={4000}
              rows={8}
            />
          </label>
          <div className="form-row">
            <label>
              Stage
              <select name="stage" defaultValue={project.stage}>
                <option value="idea">Idea</option>
                <option value="prototype">Prototype</option>
                <option value="early_revenue">Early revenue</option>
                <option value="growth">Growth</option>
              </select>
            </label>
            <label>
              Seeking
              <input
                name="seeking"
                defaultValue={project.seeking}
                maxLength={300}
              />
            </label>
          </div>
          <button
            className="button button-primary"
            name="intent"
            value="submit"
            disabled={navigation.state !== "idle"}
          >
            Save and submit for review
          </button>
        </Form>
      </main>
    </div>
  );
}
