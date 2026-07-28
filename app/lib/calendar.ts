function utcCalendarTimestamp(value: string) {
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "";
  return (
    date.toISOString().replaceAll("-", "").replaceAll(":", "").slice(0, 15) +
    "Z"
  );
}

export function googleCalendarEventUrl(event: {
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  publicUrl: string;
}) {
  const startsAt = utcCalendarTimestamp(event.startsAt);
  const endsAt = utcCalendarTimestamp(event.endsAt);
  if (!startsAt || !endsAt) return "";
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title);
  url.searchParams.set("dates", `${startsAt}/${endsAt}`);
  url.searchParams.set(
    "details",
    `${event.summary}\n\nEvent details: ${event.publicUrl}`,
  );
  if (event.venue) url.searchParams.set("location", event.venue);
  return url.toString();
}
