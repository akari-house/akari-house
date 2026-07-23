import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/event-detail";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser, requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";
import { EventTimeDisplay } from "~/components/EventTimeDisplay";
import { AkariMotif } from "~/components/AkariMotif";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const event = await db
    .prepare(
      `SELECT e.id, e.slug, e.host_user_id AS hostUserId, e.title, e.summary,
              e.description, e.format, e.venue,
              e.meeting_url AS meetingUrl, e.starts_at AS startsAt,
              e.ends_at AS endsAt, e.timezone, e.capacity, e.status,
              p.display_name AS hostName, u.username AS hostUsername,
              COUNT(CASE WHEN er.status = 'registered' THEN 1 END) AS registeredCount
       FROM events e
       JOIN users u ON u.id = e.host_user_id
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN event_registrations er ON er.event_id = e.id
       WHERE e.slug = ? GROUP BY e.id`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      slug: string;
      hostUserId: string;
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
      status: string;
      hostName: string;
      hostUsername: string;
      registeredCount: number;
    }>();
  if (!event || (event.status !== "published" && user?.id !== event.hostUserId))
    throw new Response("Event not found.", { status: 404 });
  const registration = user
    ? await db
        .prepare(
          `SELECT status FROM event_registrations
           WHERE event_id = ? AND user_id = ?`,
        )
        .bind(event.id, user.id)
        .first<{ status: string }>()
    : null;
  const attendees =
    user?.id === event.hostUserId
      ? await db
          .prepare(
            `SELECT er.status, p.display_name AS displayName, u.username
             FROM event_registrations er
             JOIN users u ON u.id = er.user_id
             JOIN profiles p ON p.user_id = u.id
             WHERE er.event_id = ? AND er.status <> 'cancelled'
             ORDER BY er.created_at`,
          )
          .bind(event.id)
          .all<{
            status: string;
            displayName: string;
            username: string;
          }>()
      : null;
  return {
    user,
    event: {
      ...event,
      meetingUrl:
        user?.id === event.hostUserId || registration?.status === "registered"
          ? event.meetingUrl
          : "",
    },
    registration,
    attendees: attendees?.results ?? [],
    submitted: new URL(request.url).searchParams.has("submitted"),
    registrationFeedback:
      new URL(request.url).searchParams.get("registration") ?? "",
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const event = await db
    .prepare(
      `SELECT id, host_user_id AS hostUserId, title, capacity, status
       FROM events WHERE slug = ?`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      hostUserId: string;
      title: string;
      capacity: number | null;
      status: string;
    }>();
  if (!event || event.status !== "published")
    throw new Response("Event not available.", { status: 404 });
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  if (intent === "register") {
    const result = await db
      .prepare(
        `INSERT INTO event_registrations
         (event_id, user_id, status, updated_at)
         VALUES (?, ?, CASE
           WHEN ? IS NULL OR (
             SELECT COUNT(*) FROM event_registrations
             WHERE event_id = ? AND status = 'registered'
           ) < ? THEN 'registered' ELSE 'waitlisted' END, datetime('now'))
         ON CONFLICT(event_id, user_id) DO UPDATE SET
           status = excluded.status, updated_at = excluded.updated_at`,
      )
      .bind(event.id, user.id, event.capacity, event.id, event.capacity)
      .run();
    if ((result.meta.changes ?? 0) !== 1)
      return { error: "Registration could not be saved." };
    const saved = await db
      .prepare(
        `SELECT status FROM event_registrations
         WHERE event_id = ? AND user_id = ?`,
      )
      .bind(event.id, user.id)
      .first<{ status: string }>();
    await db
      .prepare(
        `INSERT INTO notifications
         (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'event.registration', 'New event registration', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        event.hostUserId,
        `${user.displayName} ${saved?.status === "waitlisted" ? "joined the waitlist for" : "registered for"} ${event.title}.`,
        `/events/${params.slug}`,
      )
      .run();
    throw redirect(
      `/events/${params.slug}?registration=${saved?.status === "waitlisted" ? "waitlisted" : "registered"}`,
    );
  } else if (intent === "cancel") {
    await db
      .prepare(
        `UPDATE event_registrations SET status = 'cancelled',
         updated_at = datetime('now') WHERE event_id = ? AND user_id = ?`,
      )
      .bind(event.id, user.id)
      .run();
    throw redirect(`/events/${params.slug}?registration=cancelled`);
  } else throw new Response("Unsupported action.", { status: 400 });
}

export default function EventDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { event, user } = loaderData;
  const registered = loaderData.registration?.status === "registered";
  const waitlisted = loaderData.registration?.status === "waitlisted";
  const isHost = user?.id === event.hostUserId;
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  return (
    <div className="site-shell">
      <SiteHeader user={user} />
      <main id="main-content" className="project-detail-main event-detail-main">
        {loaderData.submitted && (
          <p className="notice success">
            Event submitted. It remains private until review.
          </p>
        )}
        {loaderData.registrationFeedback === "registered" && (
          <p className="notice success" role="status">
            You are registered. The time below includes the event timezone and,
            when different, your local timezone.
          </p>
        )}
        {loaderData.registrationFeedback === "waitlisted" && (
          <p className="notice" role="status">
            The event is currently full, so you joined the waitlist. AKARI will
            notify you if your registration status changes.
          </p>
        )}
        {loaderData.registrationFeedback === "cancelled" && (
          <p className="notice success" role="status">
            Your registration or waitlist place was cancelled.
          </p>
        )}
        <header className="event-detail-intro">
          <div className="event-detail-kamon" aria-hidden="true">
            <AkariMotif motif="blossom" />
            <AkariMotif motif="thread" className="event-detail-thread" />
          </div>
          <div>
            <span className="chapter">
              {event.format.replace("_", " ")} · {event.status}
            </span>
            <h1>{event.title}</h1>
            <p className="project-lede">{event.summary}</p>
          </div>
        </header>
        <div className="event-detail-layout">
          <div className="event-detail-story">
            <span className="eyebrow">The invitation</span>
            <p className="project-story">{event.description}</p>
            <p className="event-detail-host">
              <AkariMotif motif="nameplate" />
              <span>
                Hosted by{" "}
                <Link to={`/profiles/${event.hostUsername}`}>
                  {event.hostName}
                </Link>
              </span>
            </p>
          </div>
          <section
            className="project-seeking-panel event-invitation-panel"
            aria-label="Event invitation details"
          >
            <AkariMotif motif="invitation" className="event-panel-mark" />
            <div className="event-detail-time">
              <span>Begins</span>
              <EventTimeDisplay
                startsAt={event.startsAt}
                timezone={event.timezone}
              />
            </div>
            <div className="event-detail-time">
              <span>Closes</span>
              <EventTimeDisplay
                startsAt={event.endsAt}
                timezone={event.timezone}
                showViewerTime={false}
              />
            </div>
            {event.venue && (
              <p>
                <strong>Place</strong>
                {event.venue}
              </p>
            )}
            <p>
              <strong>Guest list</strong>
              {event.registeredCount}
              {event.capacity ? ` / ${event.capacity}` : ""} registered
            </p>
            {event.meetingUrl && (
              <a href={event.meetingUrl} rel="noreferrer" target="_blank">
                Open meeting room
              </a>
            )}
          </section>
        </div>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {user && !isHost && event.status === "published" && (
          <Form method="post">
            <button
              className={
                registered || waitlisted
                  ? "button button-quiet"
                  : "button button-primary"
              }
              name="intent"
              value={registered || waitlisted ? "cancel" : "register"}
              disabled={pending}
              onClick={(clickEvent) => {
                if (
                  (registered || waitlisted) &&
                  !window.confirm(
                    waitlisted
                      ? "Leave this event waitlist?"
                      : "Cancel your event registration?",
                  )
                )
                  clickEvent.preventDefault();
              }}
            >
              {pending
                ? "Saving..."
                : registered
                  ? "Cancel registration"
                  : waitlisted
                    ? "Leave waitlist"
                    : "Register"}
            </button>
          </Form>
        )}
        {!user && event.status === "published" && (
          <Link
            className="button button-primary"
            to={`/login?returnTo=/events/${event.slug}`}
          >
            Log in to register
          </Link>
        )}
        {isHost && (
          <section className="project-interest-list">
            <h2>Registrations</h2>
            {loaderData.attendees.length ? (
              loaderData.attendees.map((attendee) => (
                <article key={attendee.username}>
                  <Link to={`/profiles/${attendee.username}`}>
                    {attendee.displayName}
                  </Link>
                  <span className="status-pill">{attendee.status}</span>
                </article>
              ))
            ) : (
              <div className="status-card">
                <h3>No registrations yet.</h3>
                <p>Registered and waitlisted members will appear here.</p>
              </div>
            )}
          </section>
        )}
        {user && !isHost && (
          <Link
            className="quiet-link"
            to={`/report?subjectType=event&subjectId=${encodeURIComponent(event.id)}&returnTo=${encodeURIComponent(`/events/${event.slug}`)}`}
          >
            Report event
          </Link>
        )}
      </main>
    </div>
  );
}
