import type { Route } from "./+types/event-media";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, params, context }: Route.LoaderArgs) {
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
  const event = await env.DB.prepare(
    `SELECT image_key AS imageKey, status, host_user_id AS hostUserId
     FROM events WHERE slug = ?`,
  )
    .bind(params.slug)
    .first<{
      imageKey: string | null;
      status: string;
      hostUserId: string;
    }>();

  if (
    !event?.imageKey ||
    (event.status !== "published" &&
      user?.id !== event.hostUserId &&
      !canReview)
  )
    throw new Response("Event image not found.", { status: 404 });

  const object = await env.MEDIA.get(event.imageKey);
  if (!object) throw new Response("Event image not found.", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set(
    "cache-control",
    event.status === "published"
      ? "public, max-age=3600, stale-while-revalidate=86400"
      : "private, no-store",
  );
  return new Response(object.body, { headers });
}
