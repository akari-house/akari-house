import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-events";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { EventTimeDisplay } from "~/components/EventTimeDisplay";
import { SiteHeader } from "~/components/SiteHeader";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type EventReviewRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  format: string;
  venue: string;
  meetingUrl: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  capacity: number | null;
  imageKey: string | null;
  imageSourceUrl: string;
  hostName: string;
  hostUsername: string;
  createdAt: string;
};

export const meta: Route.MetaFunction = () => [
  { title: "Event Publishing | AKARI House" },
  {
    name: "description",
    content: "Review and publish submitted AKARI House events.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "projects");
  const access = await loadAdminWorkspaceAccess(db, user.id);
  const events = await db
    .prepare(
      `SELECT e.id, e.slug, e.title, e.summary, e.description, e.format,
              e.venue, e.meeting_url AS meetingUrl,
              e.starts_at AS startsAt, e.ends_at AS endsAt, e.timezone,
              e.capacity, e.image_key AS imageKey,
              e.image_source_url AS imageSourceUrl,
              e.created_at AS createdAt,
              p.display_name AS hostName, u.username AS hostUsername
         FROM events e
         JOIN users u ON u.id = e.host_user_id
         JOIN profiles p ON p.user_id = e.host_user_id
        WHERE e.status = 'submitted'
        ORDER BY e.created_at ASC`,
    )
    .all<EventReviewRow>();

  return { user, access, events: events.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdminScope(request, db, "projects");
  const form = await request.formData();
  const eventId = formText(form.get("eventId"));
  const decision = formText(form.get("decision"));
  const suppliedNote = formText(form.get("decisionNote")).trim();

  if (!eventId) throw new Response("Event is required.", { status: 400 });
  if (!["publish", "decline"].includes(decision))
    throw new Response("Invalid event decision.", { status: 400 });

  if (
    decision === "decline" &&
    (suppliedNote.length < 5 || suppliedNote.length > 500)
  )
    return {
      error: "Add a decline reason between 5 and 500 characters.",
    };

  if (suppliedNote.length > 500)
    return { error: "Decision notes must be 500 characters or fewer." };

  const event = await db
    .prepare(
      `SELECT id, host_user_id AS hostUserId, slug, title
         FROM events
        WHERE id = ? AND status = 'submitted'`,
    )
    .bind(eventId)
    .first<{
      id: string;
      hostUserId: string;
      slug: string;
      title: string;
    }>();

  if (!event)
    return {
      error:
        "This event is no longer awaiting publication. Refresh the queue and try again.",
    };

  const status = decision === "publish" ? "published" : "declined";
  const decisionNote =
    suppliedNote ||
    (decision === "publish"
      ? "Published by an authorized AKARI administrator."
      : "Declined by AKARI.");

  await db.batch([
    db
      .prepare(
        `UPDATE events
            SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
                updated_at = datetime('now')
          WHERE id = ? AND status = 'submitted'`,
      )
      .bind(status, admin.id, event.id),
    db
      .prepare(
        `INSERT INTO notifications
         (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'event.reviewed', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        event.hostUserId,
        decision === "publish" ? "Event published" : "Event needs revision",
        `${event.title} was ${status}. Review note: ${decisionNote}`,
        `/events/${event.slug}`,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'event.reviewed', 'event', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        event.id,
        JSON.stringify({ status, decisionNote, source: "admin-events" }),
      ),
  ]);

  return {
    saved:
      decision === "publish"
        ? `${event.title} is now published.`
        : `${event.title} was declined and returned to the host with your note.`,
  };
}

export default function AdminEvents({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">AKARI event publishing</span>
            <h1>Events awaiting publication</h1>
            <p>
              Publish a valid event in one action. A note is optional when
              publishing and required only when declining.
            </p>
          </div>
          <Link className="button button-primary" to="/events/new">
            Create and publish event
          </Link>
        </header>

        <AdminWorkspaceNav access={loaderData.access} />

        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success" role="status">
            {actionData.saved}
          </p>
        )}

        <section className="application-list" aria-busy={pending}>
          {loaderData.events.length ? (
            loaderData.events.map((event) => (
              <article className="application-card" key={event.id}>
                <div>
                  {event.imageKey && (
                    <img
                      className="review-event-cover"
                      src={`/media/events/${event.slug}`}
                      alt={`${event.title} proposed cover`}
                      width={720}
                      height={405}
                    />
                  )}
                  <span className="chapter">
                    {event.format.replaceAll("_", " ")} · submitted
                  </span>
                  <h2>{event.title}</h2>
                  <p>{event.summary}</p>
                  <small>
                    Hosted by {event.hostName} (@{event.hostUsername})
                  </small>
                  <EventTimeDisplay
                    startsAt={event.startsAt}
                    timezone={event.timezone}
                  />
                  <div className="button-row">
                    <Link className="quiet-link" to={`/events/${event.slug}`}>
                      Preview event
                    </Link>
                    {event.meetingUrl && (
                      <a
                        className="quiet-link"
                        href={event.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Check meeting link
                      </a>
                    )}
                  </div>
                </div>

                <Form method="post" className="application-actions">
                  <input type="hidden" name="eventId" value={event.id} />
                  <label>
                    Review note <small>Optional when publishing</small>
                    <textarea
                      name="decisionNote"
                      maxLength={500}
                      rows={3}
                      placeholder="Optional publication note, or add a reason before declining."
                    />
                  </label>
                  <button
                    className="button button-primary"
                    name="decision"
                    value="publish"
                    disabled={pending}
                  >
                    Publish now
                  </button>
                  <button
                    className="button button-quiet"
                    name="decision"
                    value="decline"
                    disabled={pending}
                  >
                    Decline
                  </button>
                </Form>
              </article>
            ))
          ) : (
            <div className="status-card">
              <h2>No events are waiting.</h2>
              <p>
                New host submissions will appear here. Admin-created events can
                be published directly from the event editor.
              </p>
              <Link className="button button-primary" to="/events/new">
                Create event
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
