import { Link } from "react-router";
import { AkariMotif } from "~/components/AkariMotif";
import { googleCalendarEventUrl } from "~/lib/calendar";

export type EventInvitation = {
  slug: string;
  title: string;
  summary: string;
  format: string;
  venue: string;
  startsAt: string;
  endsAt?: string;
  timezone: string;
  capacity: number | null;
  hostName: string;
  registeredCount: number;
  imageKey?: string | null;
};

function eventDateParts(startsAt: string, timezone: string) {
  const date = new Date(normalizeEventTime(startsAt));
  const options = { timeZone: timezone || "UTC" };
  try {
    return {
      month: new Intl.DateTimeFormat("en", {
        ...options,
        month: "short",
      }).format(date),
      day: new Intl.DateTimeFormat("en", {
        ...options,
        day: "2-digit",
      }).format(date),
      time: new Intl.DateTimeFormat("en", {
        ...options,
        hour: "2-digit",
        minute: "2-digit",
      }).format(date),
    };
  } catch {
    return {
      month: new Intl.DateTimeFormat("en", {
        timeZone: "UTC",
        month: "short",
      }).format(date),
      day: new Intl.DateTimeFormat("en", {
        timeZone: "UTC",
        day: "2-digit",
      }).format(date),
      time: new Intl.DateTimeFormat("en", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date),
    };
  }
}

function normalizeEventTime(value: string) {
  if (value.includes("T")) return value;
  return `${value.replace(" ", "T")}Z`;
}

export function EventInvitationCard({
  event,
  compact = false,
}: {
  event: EventInvitation;
  compact?: boolean;
}) {
  const date = eventDateParts(event.startsAt, event.timezone);
  const capacityPercent = event.capacity
    ? Math.min(100, (event.registeredCount / event.capacity) * 100)
    : 0;
  const calendarUrl = event.endsAt
    ? googleCalendarEventUrl({
        title: event.title,
        summary: event.summary,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        venue: event.venue,
        publicUrl: `https://akarihouse.com/events/${event.slug}`,
      })
    : "";

  return (
    <article
      className={`event-invitation-card${event.imageKey ? " has-image" : ""}${
        compact ? " is-compact" : ""
      }`}
    >
      {event.imageKey && (
        <Link
          className="event-invitation-cover"
          to={`/events/${event.slug}`}
          aria-label={`Open ${event.title}`}
        >
          <img
            src={`/media/events/${event.slug}`}
            alt=""
            width={720}
            height={405}
            loading="lazy"
          />
        </Link>
      )}
      <div className="event-invitation-date">
        <AkariMotif motif="invitation" className="event-invitation-mark" />
        <time
          className="event-date-seal"
          dateTime={normalizeEventTime(event.startsAt)}
        >
          <span>{date.month}</span>
          <strong>{date.day}</strong>
          <small>{date.time}</small>
        </time>
      </div>
      <div className="event-invitation-body">
        <div className="discovery-card-meta">
          <span>{event.format.replaceAll("_", " ")}</span>
          <span>{event.venue || "Online"}</span>
          <span>{event.timezone}</span>
        </div>
        <h3>
          <Link to={`/events/${event.slug}`}>{event.title}</Link>
        </h3>
        <p>{event.summary}</p>
        <footer>
          <span className="event-host-nameplate">
            <AkariMotif motif="nameplate" />
            Hosted by {event.hostName}
          </span>
          <span>
            {event.registeredCount}
            {event.capacity ? ` / ${event.capacity}` : ""} registered
          </span>
          <Link className="event-card-action" to={`/events/${event.slug}`}>
            View gathering
          </Link>
          {calendarUrl && (
            <a
              className="event-card-action"
              href={calendarUrl}
              target="_blank"
              rel="noreferrer"
            >
              Add to calendar
            </a>
          )}
        </footer>
        {event.capacity && (
          <div
            className="event-capacity"
            role="progressbar"
            aria-label={`${event.registeredCount} of ${event.capacity} places registered`}
            aria-valuemin={0}
            aria-valuemax={event.capacity}
            aria-valuenow={event.registeredCount}
          >
            <span style={{ width: `${capacityPercent}%` }} />
          </div>
        )}
      </div>
    </article>
  );
}
