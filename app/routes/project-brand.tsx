import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-brand";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireProjectManagerBySlug } from "~/lib/project-access.server";
import { validateProfilePhoto } from "~/lib/profile-photo.server";
import {
  markManagedR2ObjectDeleted,
  registerManagedR2Object,
} from "~/lib/r2-lifecycle.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type BrandAsset = "logo" | "banner";

type ProjectBrandRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  logoKey: string | null;
  bannerKey: string | null;
};

function assetFromIntent(intent: string): {
  asset: BrandAsset;
  remove: boolean;
} | null {
  if (intent === "upload-logo") return { asset: "logo", remove: false };
  if (intent === "upload-banner") return { asset: "banner", remove: false };
  if (intent === "remove-logo") return { asset: "logo", remove: true };
  if (intent === "remove-banner") return { asset: "banner", remove: true };
  return null;
}

async function readOwnedProject(
  db: D1Database,
  slug: string | undefined,
  userId: string,
) {
  const access = await requireProjectManagerBySlug(db, slug, userId);
  return db
    .prepare(
      `SELECT id, slug, title, status, logo_key AS logoKey,
    banner_key AS bannerKey
       FROM projects WHERE id = ?`,
    )
    .bind(access.projectId)
    .first<ProjectBrandRow>();
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });
  const project = await readOwnedProject(db, params.slug, user.id);
  if (!project) throw new Response("Project not found.", { status: 404 });
  return {
    user,
    project,
    saved: new URL(request.url).searchParams.get("saved") ?? "",
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const env = context.get(cloudflareContext).env;
  const db = env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("founder"))
    throw new Response("Founder role required.", { status: 403 });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 2_750_000)
    return { error: "Project logo and banner files must be 2 MB or smaller." };

  const project = await readOwnedProject(db, params.slug, user.id);
  if (!project) throw new Response("Project not found.", { status: 404 });

  const form = await request.formData();
  const selection = assetFromIntent(formText(form.get("intent")));
  if (!selection) throw new Response("Unsupported action.", { status: 400 });

  const oldKey =
    selection.asset === "logo" ? project.logoKey : project.bannerKey;

  if (selection.remove) {
    if (selection.asset === "logo")
      await db
        .prepare(
          `UPDATE projects SET logo_key = NULL, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(project.id)
        .run();
    else
      await db
        .prepare(
          `UPDATE projects SET banner_key = NULL, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(project.id)
        .run();

    await db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'project.brand.removed', 'project', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        project.id,
        JSON.stringify({ asset: selection.asset }),
      )
      .run();

    if (oldKey) {
      await env.MEDIA.delete(oldKey);
      await markManagedR2ObjectDeleted(db, oldKey);
    }
    throw redirect(
      `/projects/${project.slug}/edit/brand?saved=${selection.asset}`,
    );
  }

  const file = form.get(selection.asset);
  if (!(file instanceof File) || !file.size)
    return { error: `Choose a ${selection.asset} image to upload.` };
  const validImage = await validateProfilePhoto(file);
  if (!validImage)
    return { error: "Use a JPG, PNG or WebP image no larger than 2 MB." };

  const objectKey = `project-documents/brand/${project.id}/${selection.asset}-${crypto.randomUUID()}.${validImage.extension}`;
  await env.MEDIA.put(objectKey, file.stream(), {
    httpMetadata: {
      contentType: validImage.contentType,
      cacheControl: "private, no-store",
    },
    customMetadata: {
      ownerId: user.id,
      projectId: project.id,
      purpose: `project-${selection.asset}`,
    },
  });

  try {
    await registerManagedR2Object(db, {
      objectKey,
      sourceType: "project_document",
      sourceId: project.id,
      ownerUserId: user.id,
    });

    const update =
      selection.asset === "logo"
        ? db
            .prepare(
              `UPDATE projects SET logo_key = ?, updated_at = datetime('now')
               WHERE id = ?`,
            )
            .bind(objectKey, project.id)
        : db
            .prepare(
              `UPDATE projects SET banner_key = ?, updated_at = datetime('now')
               WHERE id = ?`,
            )
            .bind(objectKey, project.id);

    await db.batch([
      update,
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'project.brand.updated', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          project.id,
          JSON.stringify({ asset: selection.asset }),
        ),
    ]);
  } catch (error) {
    await env.MEDIA.delete(objectKey);
    await markManagedR2ObjectDeleted(db, objectKey).catch(() => undefined);
    throw error;
  }

  if (oldKey) {
    await env.MEDIA.delete(oldKey);
    await markManagedR2ObjectDeleted(db, oldKey);
  }

  throw redirect(
    `/projects/${project.slug}/edit/brand?saved=${selection.asset}`,
  );
}

export default function ProjectBrand({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const project = loaderData.project;
  const busy = navigation.state !== "idle";

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <Link className="quiet-link" to="/projects/manage">
          ← Back to project management
        </Link>
        <span className="eyebrow">Project identity · {project.status}</span>
        <h1>Logo and Deal Room banner.</h1>
        <p>
          Give {project.title} a recognisable identity across project discovery
          and investor opportunity previews. Images are stored in private AKARI
          media and served publicly only while the project is published.
        </p>

        {loaderData.saved && (
          <p className="notice" role="status">
            Project {loaderData.saved} updated.
          </p>
        )}
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <section className="project-action-panel">
          <span className="eyebrow">Project logo</span>
          <h2>Recognition across the House</h2>
          <p>
            Use a square logo with a transparent or simple background.
            Recommended size: 800 × 800 px.
          </p>
          {project.logoKey && (
            <img
              src={`/media/projects/${project.slug}/logo`}
              alt={`${project.title} logo`}
              style={{
                width: "144px",
                height: "144px",
                objectFit: "contain",
                padding: "12px",
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: "22px",
                background: "rgba(8,11,19,.72)",
              }}
            />
          )}
          <Form
            method="post"
            encType="multipart/form-data"
            className="profile-form"
          >
            <label>
              Upload project logo
              <input
                name="logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
              <small>JPG, PNG or WebP. Maximum 2 MB.</small>
            </label>
            <button
              className="button button-primary"
              name="intent"
              value="upload-logo"
              disabled={busy}
            >
              {busy ? "Updating..." : "Save project logo"}
            </button>
          </Form>
          {project.logoKey && (
            <Form method="post">
              <button
                className="text-button"
                name="intent"
                value="remove-logo"
                disabled={busy}
              >
                Remove logo
              </button>
            </Form>
          )}
        </section>

        <section className="project-action-panel">
          <span className="eyebrow">Deal Room banner</span>
          <h2>A stronger investor-facing header</h2>
          <p>
            Use a clean landscape image that represents the project without
            placing essential text near the edges. Recommended size: 1600 × 600
            px.
          </p>
          {project.bannerKey && (
            <img
              src={`/media/projects/${project.slug}/banner`}
              alt={`${project.title} banner`}
              style={{
                width: "min(720px, 100%)",
                aspectRatio: "8 / 3",
                objectFit: "cover",
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: "18px",
                background: "rgba(8,11,19,.72)",
              }}
            />
          )}
          <Form
            method="post"
            encType="multipart/form-data"
            className="profile-form"
          >
            <label>
              Upload project banner
              <input
                name="banner"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
              <small>Landscape JPG, PNG or WebP. Maximum 2 MB.</small>
            </label>
            <button
              className="button button-primary"
              name="intent"
              value="upload-banner"
              disabled={busy}
            >
              {busy ? "Updating..." : "Save Deal Room banner"}
            </button>
          </Form>
          {project.bannerKey && (
            <Form method="post">
              <button
                className="text-button"
                name="intent"
                value="remove-banner"
                disabled={busy}
              >
                Remove banner
              </button>
            </Form>
          )}
        </section>
      </main>
    </div>
  );
}
