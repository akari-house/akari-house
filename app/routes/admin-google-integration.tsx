import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin-google-integration";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { beginGoogleOAuth, disconnectGoogle } from "~/lib/google-sheets.server";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "campaigns");
  const connection = await db
    .prepare(
      `SELECT connected_at AS connectedAt, updated_at AS updatedAt
       FROM google_connections WHERE user_id = ?`,
    )
    .bind(user.id)
    .first<{ connectedAt: string; updatedAt: string }>();
  const url = new URL(request.url);
  return {
    user,
    connection,
    connected: url.searchParams.has("connected"),
    disconnected: url.searchParams.has("disconnected"),
    error: url.searchParams.get("error"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { env } = context.get(cloudflareContext);
  const user = await requireAdminScope(request, env.DB, "campaigns");
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  if (intent === "connect")
    throw redirect(await beginGoogleOAuth(env.DB, user.id, env));
  if (intent === "disconnect") {
    await disconnectGoogle(env.DB, user.id, env);
    await env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_user_id, action, subject_type, subject_id)
       VALUES (?, ?, 'google.disconnected', 'integration', 'google-drive')`,
    )
      .bind(crypto.randomUUID(), user.id)
      .run();
    throw redirect("/admin/integrations/google?disconnected=1");
  }
  throw new Response("Unsupported action.", { status: 400 });
}

export default function AdminGoogleIntegration({
  loaderData,
}: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <Link className="quiet-link" to="/admin/campaigns">
          Back to campaign control
        </Link>
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Admin integration</span>
            <h1>Google Sheets</h1>
            <p>Create private IIO review sheets from AKARI campaign data.</p>
          </div>
        </header>
        {loaderData.connected && (
          <p className="notice success">Google Drive connected securely.</p>
        )}
        {loaderData.disconnected && (
          <p className="notice success">Google Drive disconnected.</p>
        )}
        {loaderData.error && (
          <p className="form-error">
            Google could not be connected. Please try again.
          </p>
        )}
        <section className="status-card integration-card">
          <span className="chapter">
            {loaderData.connection ? "Connected" : "Not connected"}
          </span>
          <h2>Campaign spreadsheet workspace</h2>
          <p>
            AKARI requests permission only for Google Drive files it creates. It
            does not request Gmail, profile, contacts, or access to unrelated
            Drive files.
          </p>
          {loaderData.connection ? (
            <Form method="post">
              <button
                className="button button-quiet"
                name="intent"
                value="disconnect"
              >
                Disconnect Google Drive
              </button>
            </Form>
          ) : (
            <Form method="post">
              <button
                className="button button-primary"
                name="intent"
                value="connect"
              >
                Connect Google Drive
              </button>
            </Form>
          )}
        </section>
      </main>
    </div>
  );
}
