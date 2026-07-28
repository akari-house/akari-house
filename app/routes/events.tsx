import { Link } from "react-router";
import type { Route } from "./+types/events";
import { SiteHeader } from "~/components/SiteHeader";
import { PublicFooter } from "~/components/PublicFooter";
import { EventInvitationCard } from "~/components/discovery/EventInvitationCard";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { canHostEvents } from "~/lib/events.server";
import { AkariMotif } from "~/components/AkariMotif";

type PublicEventRow = {
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
  imageKey: string | null;
};

export const meta: Route.MetaFunction = () => [
  { title: "Gatherings | AKARI House" },
  {
    name: "description",
    content:
      "Discover curated online and in-person gatherings hosted by approved AKARI House members.",
  },
];

async function readPublishedEvents(db: D1Database) {
  try {
    const events = await db
      .prepare(
        `SELECT e.slug, e.title, e.summary, e.format, e.venue,
                e.starts_at AS startsAt, e.ends_at AS endsAt,
                e.timezone, e.capacity, e.image_key AS imageKey,
                COALESCE(p.display_name, 'AKARI Host') AS hostName,
                COUNT(CASE WHEN er.status = 'registered' THEN 1 END) AS registeredCount
         FROM events e
         LEFT JOIN profiles p ON p.user_id = e.host_user_id
         LEFT JOIN event_registrations er ON er.event_id = e.id
         WHERE e.status = 'published' AND e.ends_at >= datetime('now')
         GROUP BY e.id ORDER BY e.starts_at`,
      )
      .all<PublicEventRow>();
    return { items: events.results, degraded: false };
  } catch (error) {
    console.error("Event directory enhanced query failed.", error);
  }

  try {
    const events = await db
      .prepare(
        `SELECT e.slug, e.title, e.summary, e.format, e.venue,
                e.starts_at AS startsAt, e.ends_at AS endsAt,
                e.timezone, NULL AS capacity, e.image_key AS imageKey,
                COALESCE(p.display_name, 'AKARI Host') AS hostName,
                0 AS registeredCount
         FROM events e
         LEFT JOIN profiles p ON p.user_id = e.host_user_id
         WHERE e.status = 'published' AND e.ends_at >= datetime('now')
         ORDER BY e.starts_at`,
      )
      .all<PublicEventRow>();
    return { items: events.results, degraded: false };
  } catch (error) {
    console.error("Event directory fallback query failed.", error);
    return { items: [] as PublicEventRow[], degraded: true };
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const [events, canHost] = await Promise.all([
    readPublishedEvents(db),
    user
      ? canHostEvents(db, user.id).catch((error) => {
          console.error("Event host eligibility query failed.", error);
          return false;
        })
      : Promise.resolve(false),
  ]);
  return {
    user,
    events: events.items,
    degraded: events.degraded,
    canHost,
  };
}

export default function Events({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell inner-page event-directory-page">
      <SiteHeader user={loaderData.user} />
      <main
        id="main-content"
        className="directory-main directory-room directory-room--events"
      >
        <header className="directory-heading directory-hero event-directory-heading">
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
        <section className="event-invitation-list" aria-label="Events">
          {loaderData.events.length ? (
            loaderData.events.map((event) => (
              <EventInvitationCard event={event} key={event.slug} />
            ))
          ) : (
            <div className="directory-empty is-event">
              <div className="empty-calendar" aria-hidden="true">
                <AkariMotif motif="invitation" />
              </div>
              <div>
                <span className="eyebrow">
                  {loaderData.degraded
                    ? "The calendar is temporarily quiet"
                    : "A quiet engawa"}
                </span>
                <h2>
                  {loaderData.degraded
                    ? "Gatherings could not be loaded."
                    : "The next gathering is taking shape."}
                </h2>
                <p>
                  {loaderData.degraded
                    ? "Please refresh the page in a moment. AKARI will not present an outage as an empty calendar."
                    : "Approved online and in-person gatherings will appear here with clear access, capacity and host information."}
                </p>
                {loaderData.degraded ? (
                  <Link className="button button-quiet" to="/events">
                    Retry gatherings
                  </Link>
                ) : loaderData.canHost ? (
                  <Link className="button button-primary" to="/events/new">
                    Propose a gathering
                  </Link>
                ) : (
                  <Link className="button button-quiet" to="/membership">
                    Learn how the House gathers
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
