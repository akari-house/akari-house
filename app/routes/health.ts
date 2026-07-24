import type { Route } from "./+types/health";
import { ensureAccountRightsSchema } from "~/lib/account-rights-schema.server";
import { ensureCampaignOperationsSchema } from "~/lib/campaign-operations-schema.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";
import { ensureIioSettlementSchema } from "~/lib/iio-settlement-schema.server";
import { ensureLaunchGateSchema } from "~/lib/launch-gate-schema.server";
import { ensureOperationalResilienceSchema } from "~/lib/operational-resilience-schema.server";
import { ensureProductionSecuritySchema } from "~/lib/production-security-schema.server";

export async function loader({ context }: Route.LoaderArgs) {
  const env = context.get(cloudflareContext).env;
  let database: boolean;

  try {
    await ensureAccountRightsSchema(env.DB);
    await ensureDiligenceSchema(env.DB);
    await ensureIioSettlementSchema(env.DB);
    await ensureProductionSecuritySchema(env.DB);
    await ensureOperationalResilienceSchema(env.DB);
    await ensureCampaignOperationsSchema(env.DB);
    await ensureLaunchGateSchema(env.DB);
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
        securityHeaders: true,
        operationalResilience: database,
        campaignOperations: database,
        launchGate: database,
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
