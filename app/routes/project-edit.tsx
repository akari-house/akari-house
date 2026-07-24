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
  const projectId = await db
    .prepare("SELECT id FROM projects WHERE slug = ? AND founder_user_id = ?")
    .bind(params.slug, user.id)
    .first<{ id: string }>();
  const [socials, team] = await Promise.all([
    db
      .prepare(
        `SELECT platform, url FROM project_social_links
         WHERE project_id = ? ORDER BY platform`,
      )
      .bind(projectId!.id)
      .all<{ platform: string; url: string }>(),
    db
      .prepare(
        `SELECT ptm.id, ptm.display_name AS displayName,
                ptm.team_role AS teamRole, ptm.social_url AS socialUrl,
                u.username AS linkedUsername
         FROM project_team_members ptm
         LEFT JOIN users u ON u.id = ptm.linked_user_id
         WHERE ptm.project_id = ? ORDER BY ptm.created_at`,
      )
      .bind(projectId!.id)
      .all<{
        id: string;
        displayName: string;
        teamRole: string;
        socialUrl: string;
        linkedUsername: string | null;
      }>(),
  ]);
  return {
    user,
    project,
    socials: Object.fromEntries(
      socials.results.map((item) => [item.platform, item.url]),
    ),
    team: team.results,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const current = await db
    .prepare(
      "SELECT id, status FROM projects WHERE slug = ? AND founder_user_id = ?",
    )
    .bind(params.slug, user.id)
    .first<{ id: string; status: string }>();
  if (!current) throw new Response("Project not found.", { status: 404 });

  if (intent === "save-socials") {
    const platforms = [
      "website",
      "x",
      "linkedin",
      "tiktok",
      "instagram",
      "facebook",
      "youtube",
    ] as const;
    const values = platforms.map((platform) => ({
      platform,
      url: formText(form.get(`social_${platform}`)).trim(),
    }));
    if (
      values.some(
        ({ url }) =>
          url &&
          (!URL.canParse(url) ||
            !["http:", "https:"].includes(new URL(url).protocol)),
      )
    )
      return { error: "Every project social link must be a complete http or https URL." };
    await db.batch([
      ...platforms.map((platform) =>
        db
          .prepare(
            "DELETE FROM project_social_links WHERE project_id = ? AND platform = ?",
          )
          .bind(current.id, platform),
      ),
      ...values
        .filter(({ url }) => url)
        .map(({ platform, url }) =>
          db
            .prepare(
              `INSERT INTO project_social_links (project_id, platform, url)
               VALUES (?, ?, ?)`,
            )
            .bind(current.id, platform, url),
        ),
    ]);
    throw redirect(`/projects/${params.slug}/edit?saved=socials`);
  }

  if (intent === "add-team") {
    const linkedUsername = formText(form.get("linkedUsername"))
      .trim()
      .toLowerCase();
    let linkedUser: { id: string; displayName: string } | null = null;
    if (linkedUsername)
      linkedUser = await db
        .prepare(
          `SELECT u.id, p.display_name AS displayName
           FROM users u JOIN profiles p ON p.user_id = u.id
           WHERE u.username = ? AND u.status IN ('active', 'restricted')`,
        )
        .bind(linkedUsername)
        .first<{ id: string; displayName: string }>();
    if (linkedUsername && !linkedUser)
      return { error: "That AKARI username could not be found." };
    const displayName =
      linkedUser?.displayName ?? formText(form.get("displayName")).trim();
    const teamRole = formText(form.get("teamRole")).trim();
    const socialUrl = formText(form.get("socialUrl")).trim();
    if (
      displayName.length < 2 ||
      displayName.length > 100 ||
      teamRole.length < 2 ||
      teamRole.length > 100 ||
      (socialUrl &&
        (!URL.canParse(socialUrl) ||
          !["http:", "https:"].includes(new URL(socialUrl).protocol)))
    )
      return { error: "Add a valid team name, role and optional social URL." };
    await db
      .prepare(
        `INSERT INTO project_team_members
         (id, project_id, linked_user_id, display_name, team_role, social_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        current.id,
        linkedUser?.id ?? null,
        displayName,
        teamRole,
        socialUrl,
      )
      .run();
    throw redirect(`/projects/${params.slug}/edit?saved=team`);
  }

  if (intent === "remove-team") {
    await db
      .prepare(
        "DELETE FROM project_team_members WHERE id = ? AND project_id = ?",
      )
      .bind(formText(form.get("teamMemberId")), current.id)
      .run();
    throw redirect(`/projects/${params.slug}/edit?saved=team`);
  }

  const title = formText(form.get("title")).trim();
  const summary = formText(form.get("summary")).trim();
  const description = formText(form.get("description")).trim();
  const seeking = formText(form.get("seeking")).trim();
  const stage = formText(form.get("stage"));
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
          {actionData?.error && (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          )}
          {project.status === "published" && (
            <p className="notice">
              Saving changes sends this project back for review and temporarily
              removes it from the public project directory.
            </p>
          )}
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
            {navigation.state === "idle"
              ? "Save and submit for review"
              : "Submitting changes..."}
          </button>
        </Form>
        <section className="project-action-panel">
          <span className="eyebrow">Project channels</span>
          <h2>Official links</h2>
          <Form method="post" className="profile-form">
            {["website", "x", "linkedin", "tiktok", "instagram", "facebook", "youtube"].map((platform) => (
              <label key={platform}>
                {platform[0].toUpperCase() + platform.slice(1)}
                <input
                  name={`social_${platform}`}
                  type="url"
                  defaultValue={loaderData.socials[platform] ?? ""}
                  placeholder="https://"
                />
              </label>
            ))}
            <button className="button button-quiet" name="intent" value="save-socials">
              Save project links
            </button>
          </Form>
        </section>
        <section className="project-action-panel">
          <span className="eyebrow">Project team</span>
          <h2>People behind the work</h2>
          <p>
            Link an AKARI username when the teammate is already onboarded.
            Otherwise add their name, role and one public social link.
          </p>
          {loaderData.team.map((member) => (
            <article key={member.id}>
              <h3>{member.displayName}</h3>
              <p>{member.teamRole}</p>
              {member.linkedUsername && <p>Linked to @{member.linkedUsername}</p>}
              {member.socialUrl && <a href={member.socialUrl} rel="noreferrer" target="_blank">Public profile</a>}
              <Form method="post">
                <input type="hidden" name="teamMemberId" value={member.id} />
                <button className="text-button" name="intent" value="remove-team">Remove</button>
              </Form>
            </article>
          ))}
          <Form method="post" className="profile-form">
            <label>AKARI username, when onboarded<input name="linkedUsername" /></label>
            <label>Name, when not yet on AKARI<input name="displayName" maxLength={100} /></label>
            <label>Role on the project<input name="teamRole" maxLength={100} required /></label>
            <label>Public social link<input name="socialUrl" type="url" placeholder="https://" /></label>
            <button className="button button-quiet" name="intent" value="add-team">Add team member</button>
          </Form>
        </section>
      </main>
    </div>
  );
}
