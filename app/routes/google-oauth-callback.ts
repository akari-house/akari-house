import { redirect } from "react-router";
import type { Route } from "./+types/google-oauth-callback";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { completeGoogleOAuth } from "~/lib/google-sheets.server";
import { requireAdminScope } from "~/lib/membership.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const admin = await requireAdminScope(request, env.DB, "campaigns");
  const url = new URL(request.url);
  if (url.searchParams.has("error"))
    throw redirect("/admin/integrations/google?error=denied");
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || code.length > 4096 || !state || state.length > 256)
    throw redirect("/admin/integrations/google?error=invalid");
  try {
    await completeGoogleOAuth(env.DB, admin.id, code, state, env);
    await env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_user_id, action, subject_type, subject_id)
       VALUES (?, ?, 'google.connected', 'integration', 'google-drive')`,
    )
      .bind(crypto.randomUUID(), admin.id)
      .run();
    throw redirect("/admin/integrations/google?connected=1");
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Google OAuth callback failed", error);
    throw redirect("/admin/integrations/google?error=callback");
  }
}
