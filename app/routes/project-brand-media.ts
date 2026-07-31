import type { Route } from "./+types/project-brand-media";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { userCanManageProject } from "~/lib/project-access.server";

const allowedAssets = ["logo", "banner"] as const;
type ProjectBrandAsset = (typeof allowedAssets)[number];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const asset = params.asset as ProjectBrandAsset;
  if (!allowedAssets.includes(asset))
    throw new Response("Project image not found.", { status: 404 });

  const env = context.get(cloudflareContext).env;
  const user = await getOptionalUser(request, env.DB);
  const canReview = user
    ? Boolean(
        await env.DB.prepare(
          `SELECT 1
           FROM admin_users au
           LEFT JOIN admin_scopes scope
             ON scope.admin_user_id = au.user_id AND scope.scope = 'projects'
           WHERE au.user_id = ?
             AND (au.access_level = 'superadmin' OR scope.scope IS NOT NULL)
           LIMIT 1`,
        )
          .bind(user.id)
          .first(),
      )
    : false;

  const project = await env.DB.prepare(
    `SELECT id, logo_key AS logoKey, banner_key AS bannerKey, status,
            founder_user_id AS founderUserId
     FROM projects WHERE slug = ?`,
  )
    .bind(params.slug)
    .first<{
      id: string;
      logoKey: string | null;
      bannerKey: string | null;
      status: string;
      founderUserId: string;
    }>();

  const canManage =
    user && project
      ? await userCanManageProject(env.DB, project.id, user.id)
      : false;
  const objectKey = asset === "logo" ? project?.logoKey : project?.bannerKey;
  if (
    !project ||
    !objectKey ||
    (project.status !== "published" && !canManage && !canReview)
  )
    throw new Response("Project image not found.", { status: 404 });

  const object = await env.MEDIA.get(objectKey);
  if (!object) throw new Response("Project image not found.", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set(
    "cache-control",
    project.status === "published"
      ? "public, max-age=3600, stale-while-revalidate=86400"
      : "private, no-store",
  );
  return new Response(object.body, { headers });
}
