import type { Route } from "./+types/public-creator-directory";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { loadPublicCreatorDirectory } from "~/lib/public-creator-directory.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const url = new URL(request.url);
  const after = url.searchParams.get("after") ?? "";
  const requestedLimit = Number(url.searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 200;
  const feed = await loadPublicCreatorDirectory(db, { after, limit });
  return Response.json(
    {
      ...feed,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}
