import { Link } from "react-router";
import type { Route } from "./+types/event-manage";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { canHostEvents, canPublishEventsDirectly } from "~/lib/events.server";
import { EventTimeDisplay } from "~/components/EventTimeDisplay";
import { AkariMotif } from "~/components/AkariMotif";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!(await canHostEvents(db, user.id)))
    throw new Response("Event-host access required.", { status: 403 });
  const events = await db
    .prepare(
      `SELECT slug, title, summary, status, starts_at AS startsAt, timezone
       FROM events WHERE host_user_id = ? ORDER BY starts_at DESC`,
    )
    .bind(user.id)
    .all<{
      slug: string;
      title: string;
      summary: string;
      status: string;
      startsAt: string;
      timezone: string;
    }>();
  return {
    user,
    events: events.results,
    canPublishDirectly: canPublishEventsDirectly(user),
    cancelled: new URL(request.url).searchParams.has("cancelled"),
  };
}

export default function EventManage({ loaderData }: Route.ComponentProps) {
  const direct = loaderData.canPublishDirectly;
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <header className="directory-heading event-directory-heading">
          <div>
            <span className="eyebrow">
              {direct ? "AKARI event publishing" : "Event host desk"}
            </span>
            <h1>
              {direct ? "Manage and publish gatherings." : "Manage your gatherings."}
            </h1>
            {direct && (
              <p>
                Your AKARI admin access publishes valid events immediately from
                the editor. Submitted member events are reviewed in the Admin
                Event Publishing queue.
              </p>
            )}
          </div>
          <div className="button-row">
            {direct && (
              <Link className="button button-quiet" to="/admin/events">
                Review submitted events
              </Link>
            )}
            <Link className="button button-primary" to="/events/new">
              {direct ? "Publish event" : "Propose event"}
            </Link>
          </div>
        </header>
        {loaderData.cancelled && (
          <p className="notice success" role="status">
            The event was cancelled and removed from the public calendar.
          </p>
        )}
        <div className="event-host-grid">
          {loaderData.events.length ? (
            loaderData.events.map((event) => (
              <article className="event-host-card" key={event.slug}>
                <AkariMotif motif="invitation" />
                <div>
                  <span className="chapter">{event.status}</span>
                  <h2>{event.title}</h2>
                  <p>{event.summary}</p>
                  <EventTimeDisplay
                    startsAt={event.startsAt}
                    timezone={event.timezone}
                  />
                </div>
                <footer>
                  <Link to={`/events/${event.slug}`}>Open invitation</Link>
                  <Link to={`/events/${event.slug}/edit`}>
                    {direct ? "Edit & publish" : "Refine"}
                  </Link>
                </footer>
              </article>
            ))
          ) : (
            <div className="status-card event-host-empty">
              <AkariMotif motif="lantern" />
              <h2>No gatherings created yet.</h2>
              <p>
                {direct
                  ? "Create a clear event with a valid date, timezone and destination. Your admin account can publish it immediately."
                  : "Start with a clear date, timezone and purpose. AKARI reviews every proposal before it enters the public calendar."}
              </p>
              <Link className="button button-primary" to="/events/new">
                {direct ? "Publish your first event" : "Propose your first event"}
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
