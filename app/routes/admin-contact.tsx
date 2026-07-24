import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-contact";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

const contactStatuses = [
  "open",
  "reviewing",
  "resolved",
  "spam",
  "all",
] as const;
type ContactStatusFilter = (typeof contactStatuses)[number];

type ContactMessageRow = {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: string;
  internalNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewerName: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "moderation");
  const requestedStatus = new URL(request.url).searchParams.get("status");
  const status: ContactStatusFilter = contactStatuses.includes(
    requestedStatus as ContactStatusFilter,
  )
    ? (requestedStatus as ContactStatusFilter)
    : "open";
  const where = status === "all" ? "" : "WHERE cm.status = ?";
  const statement = db.prepare(
    `SELECT cm.id, cm.name, cm.email, cm.topic, cm.message, cm.status,
            cm.internal_note AS internalNote,
            cm.created_at AS createdAt, cm.reviewed_at AS reviewedAt,
            reviewer.display_name AS reviewerName
     FROM contact_messages cm
     LEFT JOIN profiles reviewer ON reviewer.user_id = cm.reviewed_by
     ${where}
     ORDER BY CASE cm.status
       WHEN 'open' THEN 0
       WHEN 'reviewing' THEN 1
       WHEN 'resolved' THEN 2
       ELSE 3 END,
       cm.updated_at DESC
     LIMIT 100`,
  );
  const messages =
    status === "all"
      ? await statement.all<ContactMessageRow>()
      : await statement.bind(status).all<ContactMessageRow>();
  return { user, messages: messages.results, status };
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
          : intent === "reopen"
            ? "open"
            : null;
  if (!status || note.length > 1000)
    return { error: "Check the contact decision." };
  const current = await db
    .prepare("SELECT status FROM contact_messages WHERE id = ?")
    .bind(messageId)
    .first<{ status: string }>();
  if (!current)
    throw new Response("Contact message not found.", { status: 404 });

  await db.batch([
    db
      .prepare(
        `UPDATE contact_messages SET status = ?, reviewed_by = ?,
         reviewed_at = CASE WHEN ? IN ('resolved', 'spam')
           THEN datetime('now') ELSE NULL END,
         internal_note = CASE WHEN ? = '' THEN internal_note ELSE ? END,
         updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(status, admin.id, status, note, note, messageId),
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
        JSON.stringify({
          previousStatus: current.status,
          status,
          noteRecorded: note.length > 0,
        }),
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
            <p>
              Review support, privacy, membership and partnership messages with
              a traceable status and internal owner.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin/operations">
            Operations centre
          </Link>
          <Link className="button button-quiet" to="/admin/moderation">
            Moderation reports
          </Link>
        </header>

        <nav
          className="member-next-actions"
          aria-label="Contact status filters"
        >
          {contactStatuses.map((status) => (
            <Link
              className={
                loaderData.status === status
                  ? "button button-primary"
                  : "button button-quiet"
              }
              key={status}
              to={`?status=${status}`}
              aria-current={loaderData.status === status ? "page" : undefined}
            >
              {status === "all"
                ? "All messages"
                : status[0].toUpperCase() + status.slice(1)}
            </Link>
          ))}
        </nav>

        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success" role="status">
            Contact message updated.
          </p>
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
                <small>
                  Received {new Date(message.createdAt).toLocaleString()}
                </small>
                {message.reviewerName && (
                  <p>
                    <strong>Last handled by:</strong> {message.reviewerName}
                  </p>
                )}
                {message.reviewedAt && (
                  <small>
                    Closed {new Date(message.reviewedAt).toLocaleString()}
                  </small>
                )}
                {message.internalNote && (
                  <p>
                    <strong>Internal note:</strong> {message.internalNote}
                  </p>
                )}
              </div>
              <Form method="post" className="application-actions">
                <input type="hidden" name="messageId" value={message.id} />
                <label>
                  Internal note
                  <textarea
                    name="internalNote"
                    rows={3}
                    maxLength={1000}
                    defaultValue={message.internalNote ?? ""}
                  />
                </label>
                {message.status === "open" && (
                  <button
                    className="button button-quiet"
                    name="intent"
                    value="review"
                    disabled={pending}
                  >
                    Take ownership
                  </button>
                )}
                {["open", "reviewing"].includes(message.status) && (
                  <>
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
                  </>
                )}
                {["resolved", "spam"].includes(message.status) && (
                  <button
                    className="button button-quiet"
                    name="intent"
                    value="reopen"
                    disabled={pending}
                  >
                    Reopen
                  </button>
                )}
              </Form>
            </article>
          ))}
          {!loaderData.messages.length && (
            <section className="status-card">
              <h2>
                No {loaderData.status === "all" ? "" : loaderData.status}{" "}
                contact messages.
              </h2>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
