import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-needs";
import { ProjectNeedsFieldset } from "~/components/projects/ProjectNeedsFieldset";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { projectSeekingFromForm } from "~/lib/project-needs";
import { assertSameOrigin } from "~/lib/security.server";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const project = await db
    .prepare(
      `SELECT id, slug, title, seeking, status
       FROM projects WHERE slug = ? AND founder_user_id = ?`,
    )
    .bind(params.slug, user.id)
    .first<{
      id: string;
      slug: string;
      title: string;
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
  const project = await db
    .prepare(
      `SELECT id, slug, status FROM projects
       WHERE slug = ? AND founder_user_id = ?`,
    )
    .bind(params.slug, user.id)
    .first<{ id: string; slug: string; status: string }>();
  if (!project) throw new Response("Project not found.", { status: 404 });

  const form = await request.formData();
  const seekingInput = projectSeekingFromForm(form);
  if (seekingInput.error) return { error: seekingInput.error };

  const status =
    project.status === "published" ||
    project.status === "draft" ||
    project.status === "declined"
      ? "submitted"
      : project.status;
  await db.batch([
    db
      .prepare(
        `UPDATE projects SET seeking = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(seekingInput.value, status, project.id),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'project.needs_updated', 'project', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        project.id,
        JSON.stringify({ needs: seekingInput.needs, status }),
      ),
  ]);
  throw redirect(`/projects/${project.slug}?submitted=1`);
}

export default function ProjectNeeds({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <Link
          className="quiet-link"
          to={`/projects/${loaderData.project.slug}/edit`}
        >
          Back to project editor
        </Link>
        <span className="eyebrow">Project opportunity routing</span>
        <h1>What support does {loaderData.project.title} need?</h1>
        <p>
          Select every relevant need. Updating a published project sends it back
          through AKARI review before the changes become public.
        </p>
        <Form method="post" className="profile-form">
          {actionData?.error && (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          )}
          <ProjectNeedsFieldset value={loaderData.project.seeking} />
          <button
            className="button button-primary"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "idle"
              ? "Save needs and submit for review"
              : "Saving project needs..."}
          </button>
        </Form>
      </main>
    </div>
  );
}
