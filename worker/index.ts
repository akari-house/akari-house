import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/lib/cloudflare-context";
import { withSecurityHeaders } from "../app/lib/response-security";
import { syncDailySocialMetrics } from "../app/lib/social.server";

declare global {
  interface CloudflareEnvironment extends Env {}
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    const response = await requestHandler(request, context);
    return withSecurityHeaders(request, response);
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(syncDailySocialMetrics(env));
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
