import { createRequestHandler, RouterContextProvider } from "react-router";
import { ensureAccountRightsSchema } from "../app/lib/account-rights-schema.server";
import { processAccountRetention } from "../app/lib/account-retention.server";
import { createCampaignWorkReminders } from "../app/lib/campaign-reminders.server";
import { cloudflareContext } from "../app/lib/cloudflare-context";
import { processDeliveryOutbox } from "../app/lib/delivery-outbox.server";
import { runOperationalResilienceMaintenance } from "../app/lib/operational-resilience.server";
import { publicLoginFallbackResponse } from "../app/lib/public-login-fallback.server";
import {
  handlePublicLoginRequest,
  isPublicLoginRequest,
} from "../app/lib/public-login-handler.server";
import { withSecurityHeaders } from "../app/lib/response-security";
import { executeScheduledPlan } from "../app/lib/scheduled-execution.server";
import {
  scheduledJobPlan,
  type ScheduledJobName,
} from "../app/lib/scheduled-jobs";
import { syncDailySocialMetrics } from "../app/lib/social.server";
import { deliverTelegramNotifications } from "../app/lib/telegram.server";

declare global {
  interface CloudflareEnvironment extends Env {}
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

function runScheduledJob(job: ScheduledJobName, env: CloudflareEnvironment) {
  switch (job) {
    case "social_metrics":
      return syncDailySocialMetrics(env);
    case "campaign_reminders":
      return createCampaignWorkReminders(env);
    case "telegram_notifications":
      return deliverTelegramNotifications(env);
    case "delivery_outbox":
      return processDeliveryOutbox(env, { limit: 100 });
    case "account_retention":
      return ensureAccountRightsSchema(env.DB).then(() =>
        processAccountRetention(env),
      );
    case "operational_resilience":
      return runOperationalResilienceMaintenance(env);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (isPublicLoginRequest(request)) {
      try {
        return await handlePublicLoginRequest(request, env);
      } catch (error) {
        console.error(
          "Login escaped the Worker authentication boundary.",
          error,
        );
        return publicLoginFallbackResponse(request, env.TURNSTILE_SITE_KEY, {
          error:
            "Sign-in could not be completed safely. Refresh the page and try again.",
          status: 503,
          stage: "edge-boundary",
        });
      }
    }

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    const response = await requestHandler(request, context);
    return withSecurityHeaders(request, response);
  },
  scheduled(controller, env, ctx) {
    const plan = scheduledJobPlan(controller.cron);
    ctx.waitUntil(
      executeScheduledPlan(env, controller.cron, plan, (job) =>
        runScheduledJob(job, env),
      ).then(() => undefined),
    );
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
