import type { Route } from "./+types/house-directory-media";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareContext).env;
  const entry = await env.DB.prepare(
    `SELECT image_key AS imageKey FROM house_directory_entries
     WHERE id = ? AND status = 'published'`,
  )
    .bind(params.entryId)
    .first<{ imageKey: string | null }>();
  if (!entry?.imageKey)
    throw new Response("Directory image not found.", { status: 404 });
  const object = await env.MEDIA.get(entry.imageKey);
  if (!object)
    throw new Response("Directory image not found.", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set(
    "cache-control",
    "public, max-age=3600, stale-while-revalidate=86400",
  );
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
