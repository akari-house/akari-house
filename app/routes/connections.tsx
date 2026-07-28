import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/connections";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { acceptConnectionRequest } from "~/lib/network.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";
import { requireActionRateLimit } from "~/lib/rate-limit.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const rows = await db
    .prepare(
      `SELECT c.id, c.requester_id AS requesterId,
              c.recipient_id AS recipientId, c.status,
              CASE WHEN c.requester_id = ? THEN ru.username ELSE qu.username END AS username,
              CASE WHEN c.requester_id = ? THEN rp.display_name ELSE qp.display_name END AS displayName
       FROM connections c
       JOIN users qu ON qu.id = c.requester_id
       JOIN profiles qp ON qp.user_id = qu.id
       JOIN users ru ON ru.id = c.recipient_id
       JOIN profiles rp ON rp.user_id = ru.id
       WHERE (c.requester_id = ? OR c.recipient_id = ?)
         AND c.status IN ('pending', 'accepted')
       ORDER BY c.updated_at DESC`,
    )
    .bind(user.id, user.id, user.id, user.id)
    .all<{
      id: string;
      requesterId: string;
      recipientId: string;
      status: string;
      username: string;
      displayName: string;
    }>();
  return { user, connections: rows.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  await requireActionRateLimit(db, request, "connections", user.id, 30, 60);
  const form = await request.formData();
  const connectionId = formText(form.get("connectionId"));
  const intent = formText(form.get("intent"));
  const connection = await db
    .prepare(
      `SELECT requester_id AS requesterId, recipient_id AS recipientId, status
       FROM connections WHERE id = ?
         AND (requester_id = ? OR recipient_id = ?)`,
    )
    .bind(connectionId, user.id, user.id)
    .first<{
      requesterId: string;
      recipientId: string;
      status: string;
    }>();
  if (!connection) throw new Response("Connection not found.", { status: 404 });
  if (
    intent === "accept" &&
    connection.status === "pending" &&
    connection.recipientId === user.id
  )
    await acceptConnectionRequest(db, user, connection.requesterId);
  else if (intent === "decline" && connection.recipientId === user.id)
    await db
      .prepare(
        `UPDATE connections SET status = 'declined',
         updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(connectionId)
      .run();
  else if (intent === "cancel" && connection.requesterId === user.id)
    await db
      .prepare("DELETE FROM connections WHERE id = ? AND status = 'pending'")
      .bind(connectionId)
      .run();
  else if (intent === "disconnect" && connection.status === "accepted")
    await db
      .prepare(
        `UPDATE connections SET status = 'declined',
         updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(connectionId)
      .run();
  else throw new Response("Action not allowed.", { status: 403 });
  return { saved: true, intent };
}

export default function Connections({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Connection garden</span>
            <h1>Requests become mutual by acceptance.</h1>
            <p>
              Pending requests never unlock private contact details or count as
              connections.
            </p>
          </div>
        </header>
        {actionData?.saved && (
          <p className="notice success" role="status">
            {actionData.intent === "accept"
              ? "Connection accepted."
              : actionData.intent === "decline"
                ? "Request declined."
                : actionData.intent === "cancel"
                  ? "Request cancelled."
                  : "Connection removed."}
          </p>
        )}
        <div className="notification-list" aria-busy={pending}>
          {loaderData.connections.length === 0 && (
            <div className="status-card">
              <h2>No connections yet.</h2>
              <p>
                Visit a member profile to send a request. Incoming and accepted
                connections will appear here.
              </p>
            </div>
          )}
          {loaderData.connections.map((connection) => {
            const incoming =
              connection.status === "pending" &&
              connection.recipientId === loaderData.user.id;
            const outgoing =
              connection.status === "pending" &&
              connection.requesterId === loaderData.user.id;
            return (
              <article key={connection.id}>
                <div>
                  <span className="chapter">
                    {connection.status === "accepted"
                      ? "mutual connection"
                      : incoming
                        ? "incoming request"
                        : "outgoing request"}
                  </span>
                  <h2>
                    {connection.status === "accepted" ? (
                      <Link to={`/profiles/${connection.username}`}>
                        {connection.displayName}
                      </Link>
                    ) : (
                      connection.displayName
                    )}
                  </h2>
                  {connection.status === "pending" && (
                    <p>Profile details open after the request is accepted.</p>
                  )}
                </div>
                <Form method="post" className="application-actions">
                  <input
                    type="hidden"
                    name="connectionId"
                    value={connection.id}
                  />
                  {incoming && (
                    <>
                      <button
                        className="button button-primary"
                        name="intent"
                        value="accept"
                        disabled={pending}
                      >
                        Accept
                      </button>
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="decline"
                        disabled={pending}
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {outgoing && (
                    <button
                      className="button button-quiet"
                      name="intent"
                      value="cancel"
                      disabled={pending}
                    >
                      Cancel request
                    </button>
                  )}
                  {connection.status === "accepted" && (
                    <button
                      className="button button-quiet"
                      name="intent"
                      value="disconnect"
                      disabled={pending}
                      onClick={(event) => {
                        if (
                          !window.confirm(
                            `Disconnect from ${connection.displayName}? Private contact access provided by this connection will end.`,
                          )
                        )
                          event.preventDefault();
                      }}
                    >
                      Disconnect
                    </button>
                  )}
                </Form>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
