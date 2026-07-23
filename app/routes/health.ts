import type { Route } from "./+types/health";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ context }: Route.LoaderArgs) {
  const env = context.get(cloudflareContext).env;
  let database: boolean;

  try {
    const result = await env.DB.prepare("SELECT 1 AS ready").first<{
      ready: number;
    }>();
    database = result?.ready === 1;
  } catch {
    database = false;
  }

  const configuration =
    Boolean(env.APP_URL) &&
    Boolean(env.RESEND_API_KEY) &&
    Boolean(env.MEMBERSHIP_FROM_EMAIL) &&
    Boolean(env.TURNSTILE_SITE_KEY) &&
    Boolean(env.TURNSTILE_SECRET_KEY) &&
    Boolean(env.TURNSTILE_HOSTNAME);
  const ready = database && configuration && Boolean(env.MEDIA);

  return Response.json(
    {
      status: ready ? "ready" : "degraded",
      checks: {
        database,
        media: Boolean(env.MEDIA),
        configuration,
      },
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
