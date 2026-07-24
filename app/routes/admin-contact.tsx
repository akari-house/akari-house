import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-contact";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "moderation");
  const messages = await db
    .prepare(
      `SELECT id, name, email, topic, message, status,
              created_at AS createdAt
       FROM contact_messages
       WHERE status IN ('open', 'reviewing')
       ORDER BY created_at`,
    )
    .all<{
      id: string;
      name: string;
      email: string;
      topic: string;
      message: string;
      status: string;
      createdAt: string;
    }>();
  return { user, messages: messages.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdminScope(request, db, "moderation");
  const form = await request.formData();
  const messageId = formText(form.get("messageId"));
  const intent = formText(form.get("intent"));
  const note = formText(form.get("internalNote")).trim();
  const status =
    intent === "review"
      ? "reviewing"
      : intent === "resolve"
        ? "resolved"
        : intent === "spam"
          ? "spam"
          : null;
  if (!status || note.length > 1000)
    return { error: "Check the contact decision." };
  await db.batch([
    db
      .prepare(
        `UPDATE contact_messages SET status = ?, reviewed_by = ?,
         reviewed_at = CASE WHEN ? IN ('resolved', 'spam')
           THEN datetime('now') ELSE reviewed_at END,
         internal_note = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(status, admin.id, status, note, messageId),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'contact.reviewed', 'contact_message', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        messageId,
        JSON.stringify({ status }),
      ),
  ]);
  return { saved: true };
}

export default function AdminContact({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const pending = useNavigation().state !== "idle";
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Private contact desk</span>
            <h1>Messages to AKARI</h1>
          </div>
          <Link className="button button-quiet" to="/admin/moderation">
            Moderation reports
          </Link>
        </header>
        {actionData?.error && <p className="form-error">{actionData.error}</p>}
        {actionData?.saved && (
          <p className="notice success">Contact message updated.</p>
        )}
        <div className="application-list" aria-busy={pending}>
          {loaderData.messages.map((message) => (
            <article className="application-card" key={message.id}>
              <div>
                <span className="chapter">
                  {message.topic} · {message.status}
                </span>
                <h2>{message.name}</h2>
                <a href={`mailto:${message.email}`}>{message.email}</a>
                <p>{message.message}</p>
                <small>{message.createdAt}</small>
              </div>
              <Form method="post" className="application-actions">
                <input type="hidden" name="messageId" value={message.id} />
                <label>
                  Internal note
                  <textarea name="internalNote" rows={3} maxLength={1000} />
                </label>
                <button
                  className="button button-quiet"
                  name="intent"
                  value="review"
                  disabled={pending}
                >
                  Mark reviewing
                </button>
                <button
                  className="button button-primary"
                  name="intent"
                  value="resolve"
                  disabled={pending}
                >
                  Resolve
                </button>
                <button
                  className="button button-quiet"
                  name="intent"
                  value="spam"
                  disabled={pending}
                >
                  Mark spam
                </button>
              </Form>
            </article>
          ))}
          {!loaderData.messages.length && (
            <section className="status-card">
              <h2>No open contact messages.</h2>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
