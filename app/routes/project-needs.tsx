import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-needs";
import { ProjectNeedsFieldset } from "~/components/projects/ProjectNeedsFieldset";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  fundraisingSourceLabel,
  projectNeedPublicLabel,
  projectNeedStatus,
  projectNeedStatusFromForm,
  retainSelectedProjectNeedStatuses,
  updateProjectNeedStatus,
} from "~/lib/project-need-status";
import {
  parseProjectSeeking,
  projectNeedLabel,
  projectSeekingFromForm,
} from "~/lib/project-needs";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const project = await db
    .prepare(
      `SELECT id, slug, title, seeking, support_status_json AS supportStatus,
              status
       FROM projects WHERE slug = ? AND founder_user_id = ?`,
    )
    .bind(params.slug, user.id)
    .first<{
      id: string;
      slug: string;
      title: string;
      seeking: string;
      supportStatus: string;
      status: string;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  return {
    user,
    project,
    statusSaved: new URL(request.url).searchParams.get("status") === "saved",
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const project = await db
    .prepare(
      `SELECT id, slug, seeking, support_status_json AS supportStatus, status
       FROM projects WHERE slug = ? AND founder_user_id = ?`,
    )
    .bind(params.slug, user.id)
    .first<{
      id: string;
      slug: string;
      seeking: string;
      supportStatus: string;
      status: string;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });

  const form = await request.formData();
  const intent = formText(form.get("intent"));
  if (intent === "update-need-status") {
    const result = projectNeedStatusFromForm(form, project.seeking);
    if (result.error) return { error: result.error };
    const updatedAt = new Date().toISOString();
    const supportStatus = updateProjectNeedStatus(
      project.supportStatus,
      result.need,
      result.status,
      result.source,
      result.note,
      updatedAt,
    );
    await db.batch([
      db
        .prepare(
          `UPDATE projects SET support_status_json = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(supportStatus, project.id),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'project.need_status_updated', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          project.id,
          JSON.stringify({
            need: result.need,
            status: result.status,
            source: result.source ?? null,
            note: result.note,
          }),
        ),
    ]);
    throw redirect(`/projects/${project.slug}/needs?status=saved`);
  }

  const seekingInput = projectSeekingFromForm(form);
  if (seekingInput.error) return { error: seekingInput.error };

  const status =
    project.status === "published" ||
    project.status === "draft" ||
    project.status === "declined"
      ? "submitted"
      : project.status;
  const supportStatus = retainSelectedProjectNeedStatuses(
    project.supportStatus,
    seekingInput.needs,
  );
  await db.batch([
    db
      .prepare(
        `UPDATE projects SET seeking = ?, support_status_json = ?, status = ?,
         updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(seekingInput.value, supportStatus, status, project.id),
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
  const selectedNeeds = parseProjectSeeking(loaderData.project.seeking).needs;
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
          Select every relevant need. Updating the list on a published project
          sends it back through AKARI review before the changes become public.
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
            name="intent"
            value="save-needs"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "idle"
              ? "Save needs and submit for review"
              : "Saving project needs..."}
          </button>
        </Form>

        {selectedNeeds.length > 0 && (
          <section className="project-need-status-section">
            <span className="eyebrow">Founder-reported progress</span>
            <h2>Keep each support need accurate.</h2>
            <p>
              Closing, pausing or completing an approved need updates immediately
              and does not send the whole project back for review. Reopen it at
              any time when conversations should resume.
            </p>
            {loaderData.statusSaved && (
              <p className="notice success" role="status">
                Support status updated.
              </p>
            )}
            <div className="project-need-status-grid">
              {selectedNeeds.map((need) => {
                const record = projectNeedStatus(
                  loaderData.project.supportStatus,
                  need,
                );
                return (
                  <Form
                    method="post"
                    className="project-need-status-card"
                    key={need}
                  >
                    <input
                      type="hidden"
                      name="intent"
                      value="update-need-status"
                    />
                    <input type="hidden" name="projectNeed" value={need} />
                    <div>
                      <span className="chapter">{projectNeedLabel(need)}</span>
                      <strong>{projectNeedPublicLabel(need, record)}</strong>
                      {record.status !== "open" && (
                        <small>Founder-reported</small>
                      )}
                    </div>
                    <label>
                      Current status
                      <select name="needStatus" defaultValue={record.status}>
                        <option value="open">Open</option>
                        <option value="completed">Completed</option>
                        <option value="paused">Paused</option>
                        <option value="closed">No longer needed</option>
                      </select>
                    </label>
                    {need === "fundraising" && (
                      <label>
                        Funding source when completed
                        <select
                          name="fundraisingSource"
                          defaultValue={record.source ?? "undisclosed"}
                        >
                          <option value="akari">
                            {fundraisingSourceLabel("akari")}
                          </option>
                          <option value="external">
                            {fundraisingSourceLabel("external")}
                          </option>
                          <option value="mixed">
                            {fundraisingSourceLabel("mixed")}
                          </option>
                          <option value="undisclosed">
                            Prefer not to disclose
                          </option>
                        </select>
                      </label>
                    )}
                    <label>
                      Optional public outcome note
                      <textarea
                        name="outcomeNote"
                        defaultValue={record.note ?? ""}
                        maxLength={180}
                        rows={2}
                        placeholder="For example: Seed round completed in July 2026."
                      />
                    </label>
                    <button
                      className="button button-quiet"
                      disabled={navigation.state !== "idle"}
                    >
                      Update status
                    </button>
                  </Form>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
