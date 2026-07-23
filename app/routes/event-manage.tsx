import { Link } from "react-router";
import type { Route } from "./+types/event-manage";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { canHostEvents } from "~/lib/events.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!(await canHostEvents(db, user.id)))
    throw new Response("Event-host access required.", { status: 403 });
  const events = await db
    .prepare(
      `SELECT slug, title, summary, status, starts_at AS startsAt
       FROM events WHERE host_user_id = ? ORDER BY starts_at DESC`,
    )
    .bind(user.id)
    .all<{
      slug: string;
      title: string;
      summary: string;
      status: string;
      startsAt: string;
    }>();
  return { user, events: events.results };
}

export default function EventManage({ loaderData }: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Event host desk</span>
            <h1>Manage your gatherings.</h1>
          </div>
          <Link className="button button-primary" to="/events/new">
            Propose event
          </Link>
        </header>
        <div className="project-grid">
          {loaderData.events.map((event) => (
            <article className="project-card" key={event.slug}>
              <span className="chapter">{event.status}</span>
              <h2>{event.title}</h2>
              <p>{event.summary}</p>
              <time dateTime={event.startsAt}>
                {new Date(event.startsAt).toLocaleString()}
              </time>
              <footer>
                <Link to={`/events/${event.slug}`}>View</Link>
                <Link to={`/events/${event.slug}/edit`}>Edit</Link>
              </footer>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
