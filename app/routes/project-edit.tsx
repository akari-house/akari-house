import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-edit";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  markManagedR2ObjectDeleted,
  registerManagedR2Object,
} from "~/lib/r2-lifecycle.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const project = await db
    .prepare(
      `SELECT slug, title, summary, description, stage, seeking, status,
              data_room_url AS dataRoomUrl
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
      dataRoomUrl: string;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  const projectId = await db
    .prepare("SELECT id FROM projects WHERE slug = ? AND founder_user_id = ?")
    .bind(params.slug, user.id)
    .first<{ id: string }>();
  const [socials, team, documents] = await Promise.all([
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
    db
      .prepare(
        `SELECT id, title, content_type AS contentType, byte_size AS byteSize,
                created_at AS createdAt
         FROM project_documents WHERE project_id = ?
         ORDER BY created_at DESC`,
      )
      .bind(projectId!.id)
      .all<{
        id: string;
        title: string;
        contentType: string;
        byteSize: number;
        createdAt: string;
      }>(),
  ]);
  return {
    user,
    project,
    socials: Object.fromEntries(
      socials.results.map((item) => [item.platform, item.url]),
    ),
    team: team.results,
    documents: documents.results,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const env = context.get(cloudflareContext).env;
  const db = env.DB;
  const user = await requireApprovedMember(request, db);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 5_500_000)
    return { error: "Project documents must be 5 MB or smaller." };
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const current = await db
    .prepare(
      "SELECT id, status FROM projects WHERE slug = ? AND founder_user_id = ?",
    )
    .bind(params.slug, user.id)
    .first<{ id: string; status: string }>();
  if (!current) throw new Response("Project not found.", { status: 404 });

  if (intent === "save-data-room") {
    const value = formText(form.get("dataRoomUrl")).trim();
    if (value) {
      if (!URL.canParse(value))
        return { error: "Add a complete VantageKit URL." };
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        !["app.vantagekit.com", "vantagekit.com"].includes(
          url.hostname.toLowerCase(),
        )
      )
        return {
          error:
            "For project safety, AKARI currently recommends and accepts VantageKit data-room links only.",
        };
    }
    await db
      .prepare(
        `UPDATE projects SET data_room_url = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(value, current.id)
      .run();
    throw redirect(`/projects/${params.slug}/edit?saved=data-room`);
  }

  if (intent === "upload-document") {
    const existing = await db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS totalBytes
         FROM project_documents WHERE project_id = ?`,
      )
      .bind(current.id)
      .first<{ count: number; totalBytes: number }>();
    if ((existing?.count ?? 0) >= 5)
      return { error: "Each project can store up to five AKARI documents." };
    const file = form.get("projectDocument");
    const title = formText(form.get("documentTitle")).trim();
    const allowedTypes = new Map([
      ["application/pdf", "pdf"],
      [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "docx",
      ],
      [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xlsx",
      ],
      [
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "pptx",
      ],
    ]);
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > 5_242_880 ||
      !allowedTypes.has(file.type) ||
      title.length < 2 ||
      title.length > 120 ||
      (existing?.totalBytes ?? 0) + file.size > 26_214_400
    )
      return {
        error:
          "Choose a PDF, DOCX, XLSX or PPTX up to 5 MB and add a clear title.",
      };
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const isPdf =
      file.type === "application/pdf" &&
      signature[0] === 0x25 &&
      signature[1] === 0x50 &&
      signature[2] === 0x44 &&
      signature[3] === 0x46;
    const isOffice =
      file.type !== "application/pdf" &&
      signature[0] === 0x50 &&
      signature[1] === 0x4b;
    if (!isPdf && !isOffice)
      return { error: "The selected file does not match its document type." };
    const id = crypto.randomUUID();
    const key = `project-documents/${current.id}/${id}.${allowedTypes.get(file.type)}`;
    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: "private, no-store",
      },
      customMetadata: {
        ownerId: user.id,
        projectId: current.id,
        purpose: "project-document",
      },
    });
    await registerManagedR2Object(db, {
      objectKey: key,
      sourceType: "project_document",
      sourceId: id,
      ownerUserId: user.id,
    });
    try {
      await db
        .prepare(
          `INSERT INTO project_documents
           (id, project_id, uploaded_by, title, object_key, content_type, byte_size)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, current.id, user.id, title, key, file.type, file.size)
        .run();
    } catch (error) {
      await env.MEDIA.delete(key);
      await markManagedR2ObjectDeleted(db, key);
      throw error;
    }
    throw redirect(`/projects/${params.slug}/edit?saved=document`);
  }

  if (intent === "remove-document") {
    const document = await db
      .prepare(
        `SELECT object_key AS objectKey FROM project_documents
         WHERE id = ? AND project_id = ?`,
      )
      .bind(formText(form.get("documentId")), current.id)
      .first<{ objectKey: string }>();
    if (!document) throw new Response("Document not found.", { status: 404 });
    await db
      .prepare("DELETE FROM project_documents WHERE id = ? AND project_id = ?")
      .bind(formText(form.get("documentId")), current.id)
      .run();
    await env.MEDIA.delete(document.objectKey);
    await markManagedR2ObjectDeleted(db, document.objectKey);
    throw redirect(`/projects/${params.slug}/edit?saved=document`);
  }

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
      return {
        error:
          "Every project social link must be a complete http or https URL.",
      };
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
           FROM users u
           JOIN profiles p ON p.user_id = u.id
           JOIN membership_applications ma
             ON ma.user_id = u.id AND ma.status = 'approved'
           LEFT JOIN profile_visibility pv ON pv.user_id = u.id
           WHERE u.username = ? AND u.status = 'active'
             AND COALESCE(pv.visibility, p.visibility) = 'public'`,
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
  const stage = formText(form.get("stage"));
  if (
    title.length < 3 ||
    title.length > 100 ||
    summary.length < 20 ||
    summary.length > 280 ||
    description.length > 4000 ||
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
         stage = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(title, summary, description, stage, status, current.id),
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
          <label>
            Stage
            <select name="stage" defaultValue={project.stage}>
              <option value="idea">Idea</option>
              <option value="prototype">Prototype</option>
              <option value="early_revenue">Early revenue</option>
              <option value="growth">Growth</option>
            </select>
          </label>
          <div className="status-card project-needs-summary">
            <span className="eyebrow">Project support needs</span>
            <p>
              {project.seeking ||
                "No structured support needs have been selected yet."}
            </p>
            <Link
              className="button button-quiet"
              to={`/projects/${project.slug}/needs`}
            >
              Edit support needs
            </Link>
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
          <span className="eyebrow">Founder materials</span>
          <h2>Documents and data room</h2>
          <p>
            Keep lightweight working documents in AKARI. For sensitive,
            investor-ready diligence, use a permission-controlled VantageKit
            data room instead of uploading it here.
          </p>
          <Form method="post" className="profile-form">
            <label>
              VantageKit data-room URL
              <input
                name="dataRoomUrl"
                type="url"
                defaultValue={project.dataRoomUrl}
                placeholder="https://app.vantagekit.com/..."
              />
            </label>
            <a
              href="https://app.vantagekit.com"
              rel="noreferrer"
              target="_blank"
            >
              Open VantageKit
            </a>
            <button
              className="button button-quiet"
              name="intent"
              value="save-data-room"
            >
              Save data-room link
            </button>
          </Form>
          <p>
            AKARI storage limit: five documents, 5 MB each, 25 MB total per
            project. Do not upload private keys, passwords, identity documents,
            bank details or unredacted confidential personal data.
          </p>
          {loaderData.documents.map((document) => (
            <article key={document.id}>
              <h3>{document.title}</h3>
              <p>
                {(document.byteSize / 1_048_576).toFixed(2)} MB ·{" "}
                {document.createdAt}
              </p>
              <a href={`/projects/${project.slug}/documents/${document.id}`}>
                Download
              </a>
              <Form method="post">
                <input type="hidden" name="documentId" value={document.id} />
                <button
                  className="text-button"
                  name="intent"
                  value="remove-document"
                >
                  Remove
                </button>
              </Form>
            </article>
          ))}
          {loaderData.documents.length < 5 && (
            <Form
              method="post"
              encType="multipart/form-data"
              className="profile-form"
            >
              <label>
                Document title
                <input name="documentTitle" maxLength={120} required />
              </label>
              <label>
                PDF, Word, Excel or PowerPoint
                <input
                  name="projectDocument"
                  type="file"
                  accept=".pdf,.docx,.xlsx,.pptx"
                  required
                />
              </label>
              <button
                className="button button-quiet"
                name="intent"
                value="upload-document"
              >
                Upload private document
              </button>
            </Form>
          )}
        </section>
        <section className="project-action-panel">
          <span className="eyebrow">Project channels</span>
          <h2>Official links</h2>
          <Form method="post" className="profile-form">
            {[
              "website",
              "x",
              "linkedin",
              "tiktok",
              "instagram",
              "facebook",
              "youtube",
            ].map((platform) => (
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
            <button
              className="button button-quiet"
              name="intent"
              value="save-socials"
            >
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
              {member.linkedUsername && (
                <p>Linked to @{member.linkedUsername}</p>
              )}
              {member.socialUrl && (
                <a href={member.socialUrl} rel="noreferrer" target="_blank">
                  Public profile
                </a>
              )}
              <Form method="post">
                <input type="hidden" name="teamMemberId" value={member.id} />
                <button
                  className="text-button"
                  name="intent"
                  value="remove-team"
                >
                  Remove
                </button>
              </Form>
            </article>
          ))}
          <Form method="post" className="profile-form">
            <label>
              AKARI username, when onboarded
              <input name="linkedUsername" />
            </label>
            <label>
              Name, when not yet on AKARI
              <input name="displayName" maxLength={100} />
            </label>
            <label>
              Role on the project
              <input name="teamRole" maxLength={100} required />
            </label>
            <label>
              Public social link
              <input name="socialUrl" type="url" placeholder="https://" />
            </label>
            <button
              className="button button-quiet"
              name="intent"
              value="add-team"
            >
              Add team member
            </button>
          </Form>
        </section>
      </main>
    </div>
  );
}
