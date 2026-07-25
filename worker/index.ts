import { createRequestHandler, RouterContextProvider } from "react-router";
import { ensureAccountRightsSchema } from "../app/lib/account-rights-schema.server";
import { processAccountRetention } from "../app/lib/account-retention.server";
import { createCampaignWorkReminders } from "../app/lib/campaign-reminders.server";
import { cloudflareContext } from "../app/lib/cloudflare-context";
import { runOperationalResilienceMaintenance } from "../app/lib/operational-resilience.server";
import { withSecurityHeaders } from "../app/lib/response-security";
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
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    const response = await requestHandler(request, context);
    return withSecurityHeaders(request, response);
  },
  scheduled(controller, env, ctx) {
    const jobs = scheduledJobPlan(controller.cron).map((job) =>
      runScheduledJob(job, env),
    );
    ctx.waitUntil(Promise.all(jobs).then(() => undefined));
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
