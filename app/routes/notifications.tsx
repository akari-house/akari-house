import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/notifications";
import { SiteHeader } from "~/components/SiteHeader";
import { requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const notifications = await db
    .prepare(
      `SELECT id, kind, title, body, action_url AS actionUrl,
              read_at AS readAt, created_at AS createdAt
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(user.id)
    .all<{
      id: string;
      kind: string;
      title: string;
      body: string;
      actionUrl: string;
      readAt: string | null;
      createdAt: string;
    }>();
  return { user, notifications: notifications.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const form = await request.formData();
  const notificationId = formText(form.get("notificationId"));
  if (notificationId)
    await db
      .prepare(
        `UPDATE notifications SET read_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
      )
      .bind(notificationId, user.id)
      .run();
  else
    await db
      .prepare(
        `UPDATE notifications SET read_at = datetime('now')
         WHERE user_id = ? AND read_at IS NULL`,
      )
      .bind(user.id)
      .run();
  return { saved: true };
}

const notificationKindLabels: Record<string, string> = {
  "connection.request": "Connection request",
  "connection.accepted": "Connection accepted",
  "project.interest": "Project interest",
  "project.contact_shared": "Contact shared",
  "project.reviewed": "Project review",
  "event.registration": "Event registration",
  "event.reviewed": "Event review",
  "interest.reviewed": "Access request",
};

export default function Notifications({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  const unreadCount = loaderData.notifications.filter(
    (notification) => !notification.readAt,
  ).length;
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Notification lantern</span>
            <h1>What changed around you.</h1>
          </div>
          {unreadCount > 0 && (
            <Form method="post">
              <button className="button button-quiet" disabled={pending}>
                {pending ? "Updating..." : `Mark all ${unreadCount} as read`}
              </button>
            </Form>
          )}
        </header>
        {actionData?.saved && (
          <p className="notice success" role="status">
            Notification status updated.
          </p>
        )}
        <div className="notification-list" aria-busy={pending}>
          {loaderData.notifications.length ? (
            loaderData.notifications.map((notification) => (
              <article
                className={notification.readAt ? "" : "is-unread"}
                key={notification.id}
              >
                <div>
                  <span className="chapter">
                    {notificationKindLabels[notification.kind] ??
                      "Account update"}
                  </span>
                  <h2>{notification.title}</h2>
                  <p>{notification.body}</p>
                  <time dateTime={notification.createdAt}>
                    {new Date(notification.createdAt).toLocaleString()}
                  </time>
                </div>
                <div>
                  {notification.actionUrl && (
                    <Link
                      className="button button-quiet"
                      to={notification.actionUrl}
                    >
                      Open
                    </Link>
                  )}
                  {!notification.readAt && (
                    <Form method="post">
                      <input
                        type="hidden"
                        name="notificationId"
                        value={notification.id}
                      />
                      <button className="text-button" disabled={pending}>
                        Mark read
                      </button>
                    </Form>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="status-card">
              <h2>All quiet.</h2>
              <p>Your project and connection updates will arrive here.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
