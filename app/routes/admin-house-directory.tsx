import { Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-house-directory";
import { HouseDirectoryAdminForm } from "~/components/HouseDirectoryAdminForm";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  houseDirectoryCategories,
  houseDirectoryCategoryLabels,
  isHouseDirectoryOrganization,
  type HouseDirectoryCategory,
} from "~/lib/house-directory";
import {
  getAllHouseDirectory,
  safeExternalUrl,
} from "~/lib/house-directory.server";
import { requireSuperAdmin } from "~/lib/membership.server";
import { validateProfilePhoto } from "~/lib/profile-photo.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  return { user, entries: await getAllHouseDirectory(db) };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const env = context.get(cloudflareContext).env;
  const user = await requireSuperAdmin(request, env.DB);
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const id = formText(form.get("id")) || crypto.randomUUID();

  if (intent === "archive") {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE house_directory_entries
         SET status = 'archived', updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(user.id, id),
      env.DB.prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id)
         VALUES (?, ?, 'house_directory.archived', 'house_directory', ?)`,
      ).bind(crypto.randomUUID(), user.id, id),
    ]);
    return { saved: "Entry archived." };
  }

  if (intent !== "save")
    throw new Response("Unsupported action.", { status: 400 });

  const category = formText(form.get("category")) as HouseDirectoryCategory;
  const isOrganization = houseDirectoryCategories.includes(category)
    ? isHouseDirectoryOrganization(category)
    : false;
  const name = formText(form.get("name")).trim();
  const title = isOrganization ? "" : formText(form.get("title")).trim();
  const biography = isOrganization
    ? ""
    : formText(form.get("biography")).trim();
  const status = formText(form.get("status"));
  const displayOrder = Number.parseInt(formText(form.get("displayOrder")), 10);
  if (!houseDirectoryCategories.includes(category) || !name)
    return { error: "Name and a valid directory category are required." };
  if (!["draft", "published"].includes(status))
    return { error: "Choose draft or published status." };

  const urlNames = [
    "websiteUrl",
    "xUrl",
    "linkedinUrl",
    "instagramUrl",
    "tiktokUrl",
    "youtubeUrl",
    "telegramUrl",
  ] as const;
  const urls = Object.fromEntries(
    urlNames.map((field) => [
      field,
      isOrganization ? null : safeExternalUrl(form.get(field)),
    ]),
  ) as Record<(typeof urlNames)[number], string | null>;
  for (const field of isOrganization ? [] : urlNames) {
    if (formText(form.get(field)).trim() && !urls[field])
      return { error: "Social and website links must be valid HTTPS URLs." };
  }

  const current = await env.DB.prepare(
    "SELECT image_key AS imageKey FROM house_directory_entries WHERE id = ?",
  )
    .bind(id)
    .first<{ imageKey: string | null }>();
  let imageKey = current?.imageKey ?? null;
  const image = form.get("image");
  if (image instanceof File && image.size) {
    const valid = await validateProfilePhoto(image);
    if (!valid) return { error: "Use a JPG, PNG or WebP image up to 2 MB." };
    imageKey = `house-directory/${id}/${crypto.randomUUID()}.${valid.extension}`;
    await env.MEDIA.put(imageKey, image.stream(), {
      httpMetadata: { contentType: valid.contentType },
    });
  }
  if (isOrganization && status === "published" && !imageKey)
    return { error: "Add a logo before publishing an organization." };

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO house_directory_entries (
        id, category, name, title, biography, image_key, website_url,
        x_url, linkedin_url, instagram_url, tiktok_url, youtube_url,
        telegram_url, display_order, status, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        category = excluded.category, name = excluded.name,
        title = excluded.title, biography = excluded.biography,
        image_key = excluded.image_key, website_url = excluded.website_url,
        x_url = excluded.x_url, linkedin_url = excluded.linkedin_url,
        instagram_url = excluded.instagram_url,
        tiktok_url = excluded.tiktok_url, youtube_url = excluded.youtube_url,
        telegram_url = excluded.telegram_url,
        display_order = excluded.display_order, status = excluded.status,
        updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      id,
      category,
      name,
      title || null,
      biography || null,
      imageKey,
      urls.websiteUrl,
      urls.xUrl,
      urls.linkedinUrl,
      urls.instagramUrl,
      urls.tiktokUrl,
      urls.youtubeUrl,
      urls.telegramUrl,
      Number.isFinite(displayOrder) ? displayOrder : 0,
      status,
      user.id,
      user.id,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_user_id, action, subject_type, subject_id, metadata_json)
       VALUES (?, ?, 'house_directory.saved', 'house_directory', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      user.id,
      id,
      JSON.stringify({ category, status }),
    ),
  ]);
  return { saved: "House directory entry saved." };
}

export default function AdminHouseDirectory({
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
            <span className="eyebrow">Superadmin · Public identity</span>
            <h1>People and partners</h1>
            <p>
              Manage the public AKARI Team, Advisors, Supporters, Partners and
              Value-Added Providers.
            </p>
          </div>
          <Link className="button button-quiet" to="/team">
            View public page
          </Link>
        </header>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success">{actionData.saved}</p>
        )}
        {navigation.state !== "idle" && <p className="notice">Saving…</p>}
        <section className="status-card">
          <h2>Add a person or organization</h2>
          <HouseDirectoryAdminForm />
        </section>
        <section
          className="directory-admin-list"
          aria-label="Directory entries"
        >
          {loaderData.entries.map((entry) => (
            <details className="status-card" key={entry.id}>
              <summary>
                <span>{houseDirectoryCategoryLabels[entry.category]}</span>
                <strong>{entry.name}</strong>
                <em>{entry.status}</em>
              </summary>
              <HouseDirectoryAdminForm entry={entry} />
            </details>
          ))}
        </section>
      </main>
    </div>
  );
}
