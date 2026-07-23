import { Link } from "react-router";
import type { Route } from "./+types/events";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { canHostEvents } from "~/lib/events.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const events = await db
    .prepare(
      `SELECT e.slug, e.title, e.summary, e.format, e.venue,
              e.starts_at AS startsAt, e.ends_at AS endsAt,
              e.timezone, e.capacity, p.display_name AS hostName,
              COUNT(CASE WHEN er.status = 'registered' THEN 1 END) AS registeredCount
       FROM events e
       JOIN profiles p ON p.user_id = e.host_user_id
       LEFT JOIN event_registrations er ON er.event_id = e.id
       WHERE e.status = 'published' AND e.ends_at >= datetime('now')
       GROUP BY e.id ORDER BY e.starts_at`,
    )
    .all<{
      slug: string;
      title: string;
      summary: string;
      format: string;
      venue: string;
      startsAt: string;
      endsAt: string;
      timezone: string;
      capacity: number | null;
      hostName: string;
      registeredCount: number;
    }>();
  return {
    user,
    events: events.results,
    canHost: user ? await canHostEvents(db, user.id) : false,
  };
}

export default function Events({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">AKARI gatherings</span>
            <h1>Meet where the story moves forward.</h1>
            <p>
              Curated online and in-person gatherings hosted by approved AKARI
              members.
            </p>
          </div>
          {loaderData.canHost && (
            <Link className="button button-primary" to="/events/new">
              Propose an event
            </Link>
          )}
        </header>
        <div className="project-grid">
          {loaderData.events.length ? (
            loaderData.events.map((event) => (
              <article className="project-card event-card" key={event.slug}>
                <span className="chapter">{event.format.replace("_", " ")}</span>
                <h2>
                  <Link to={`/events/${event.slug}`}>{event.title}</Link>
                </h2>
                <p>{event.summary}</p>
                <time dateTime={event.startsAt}>
                  {new Date(event.startsAt).toLocaleString()} · {event.timezone}
                </time>
                <footer>
                  <span>Hosted by {event.hostName}</span>
                  <span>
                    {event.registeredCount}
                    {event.capacity ? ` / ${event.capacity}` : ""} registered
                  </span>
                </footer>
              </article>
            ))
          ) : (
            <div className="status-card">
              <h2>The calendar is being prepared.</h2>
              <p>Approved gatherings will appear here.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
