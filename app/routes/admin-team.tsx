import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-team";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

const scopes = [
  ["membership", "Membership"],
  ["verification", "Role verification"],
  ["projects", "Projects"],
  ["campaigns", "Campaigns"],
  ["moderation", "Moderation"],
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const admins = await db
    .prepare(
      `SELECT u.id, u.username, u.email, p.display_name AS displayName,
              au.access_level AS accessLevel,
              group_concat(s.scope, ',') AS scopes
       FROM admin_users au
       JOIN users u ON u.id = au.user_id
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN admin_scopes s ON s.admin_user_id = au.user_id
       GROUP BY u.id ORDER BY au.access_level DESC, p.display_name`,
    )
    .all<{
      id: string;
      username: string;
      email: string;
      displayName: string;
      accessLevel: "admin" | "superadmin";
      scopes: string | null;
    }>();
  return { user, admins: admins.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const superadmin = await requireSuperAdmin(request, db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const username = formText(form.get("username")).trim().toLowerCase();
  const targetId = formText(form.get("targetId"));

  if (intent === "assign") {
    const target = await db
      .prepare(
        `SELECT id FROM users
         WHERE username = ? AND status = 'active' AND email_verified_at IS NOT NULL`,
      )
      .bind(username)
      .first<{ id: string }>();
    if (!target)
      return { error: "Choose an active, email-verified AKARI member." };
    const selectedScopes = scopes
      .map(([scope]) => scope)
      .filter((scope) => form.get(`scope_${scope}`) === "on");
    if (!selectedScopes.length)
      return { error: "Select at least one administrator permission." };
    await db.batch([
      db
        .prepare(
          `INSERT INTO admin_users (user_id, access_level)
           VALUES (?, 'admin')
           ON CONFLICT(user_id) DO UPDATE SET access_level = 'admin'`,
        )
        .bind(target.id),
      db
        .prepare("DELETE FROM admin_scopes WHERE admin_user_id = ?")
        .bind(target.id),
      ...selectedScopes.map((scope) =>
        db
          .prepare(
            `INSERT INTO admin_scopes
             (admin_user_id, scope, granted_by) VALUES (?, ?, ?)`,
          )
          .bind(target.id, scope, superadmin.id),
      ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'admin.assigned', 'user', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          superadmin.id,
          target.id,
          JSON.stringify({ scopes: selectedScopes }),
        ),
    ]);
    return { saved: "Administrator permissions assigned." };
  }

  if (intent === "remove") {
    if (!targetId || targetId === superadmin.id)
      return { error: "You cannot remove your own Superadmin access." };
    const target = await db
      .prepare(
        `SELECT access_level AS accessLevel FROM admin_users WHERE user_id = ?`,
      )
      .bind(targetId)
      .first<{ accessLevel: string }>();
    if (!target) return { error: "Administrator not found." };
    if (target.accessLevel === "superadmin")
      return { error: "Another Superadmin cannot be removed from this screen." };
    await db.batch([
      db.prepare("DELETE FROM admin_users WHERE user_id = ?").bind(targetId),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id)
           VALUES (?, ?, 'admin.removed', 'user', ?)`,
        )
        .bind(crypto.randomUUID(), superadmin.id, targetId),
    ]);
    return { saved: "Administrator access removed." };
  }

  throw new Response("Unsupported action.", { status: 400 });
}

export default function AdminTeam({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Superadmin</span>
            <h1>Platform administrators</h1>
            <p>Grant only the areas each administrator is responsible for.</p>
          </div>
          <Link className="button button-quiet" to="/admin/applications">
            Membership desk
          </Link>
        </header>
        {actionData?.error && (
          <p className="form-error" role="alert">{actionData.error}</p>
        )}
        {actionData?.saved && (
          <p className="notice success">{actionData.saved}</p>
        )}
        <section className="status-card">
          <h2>Assign an administrator</h2>
          <Form method="post" className="profile-form">
            <label>
              AKARI username
              <input name="username" required placeholder="member-username" />
            </label>
            <fieldset>
              <legend>Permissions</legend>
              <div className="admin-scope-grid">
                {scopes.map(([scope, label]) => (
                  <label className="inline-choice" key={scope}>
                    <input type="checkbox" name={`scope_${scope}`} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              className="button button-primary"
              name="intent"
              value="assign"
              disabled={navigation.state !== "idle"}
            >
              Assign administrator
            </button>
          </Form>
        </section>
        <section className="application-list" aria-label="Administrators">
          {loaderData.admins.map((admin) => (
            <article className="application-card" key={admin.id}>
              <div>
                <span className="chapter">{admin.accessLevel}</span>
                <h2>{admin.displayName}</h2>
                <p>@{admin.username} · {admin.email}</p>
                <p>
                  {admin.accessLevel === "superadmin"
                    ? "All platform permissions"
                    : admin.scopes?.split(",").join(" · ") || "No permissions"}
                </p>
              </div>
              {admin.accessLevel !== "superadmin" && (
                <Form method="post">
                  <input type="hidden" name="targetId" value={admin.id} />
                  <button
                    className="button button-quiet"
                    name="intent"
                    value="remove"
                  >
                    Remove administrator
                  </button>
                </Form>
              )}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
