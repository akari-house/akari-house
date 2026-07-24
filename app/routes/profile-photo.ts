import type { Route } from "./+types/profile-photo";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { getVisibleProfile } from "~/lib/profile.server";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareContext).env;
  const user = await getOptionalUser(request, env.DB);
  const profile = await getVisibleProfile(
    env.DB,
    params.username,
    user?.id ?? null,
  );
  if (!profile?.avatarKey)
    throw new Response("Profile photo not found.", { status: 404 });

  const object = await env.MEDIA.get(profile.avatarKey);
  if (!object) throw new Response("Profile photo not found.", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=300");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
