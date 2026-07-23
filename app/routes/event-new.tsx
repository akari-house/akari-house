import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/event-new";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { canHostEvents, uniqueEventSlug } from "~/lib/events.server";
import {
  isValidTimezone,
  localEventTimeToUtc,
  validEventTimes,
} from "~/lib/events";
import { EventTimezoneField } from "~/components/EventTimeDisplay";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, normalizeWebsite } from "~/lib/validation";
import { AkariMotif } from "~/components/AkariMotif";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!(await canHostEvents(db, user.id)))
    throw new Response("Approved event-host access is required.", {
      status: 403,
    });
  return { user };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!(await canHostEvents(db, user.id)))
    throw new Response("Approved event-host access is required.", {
      status: 403,
    });
  const form = await request.formData();
  const title = formText(form.get("title")).trim();
  const summary = formText(form.get("summary")).trim();
  const description = formText(form.get("description")).trim();
  const format = formText(form.get("format"));
  const venue = formText(form.get("venue")).trim();
  const meetingUrl = normalizeWebsite(form.get("meetingUrl"));
  const startsAtLocal = formText(form.get("startsAt"));
  const endsAtLocal = formText(form.get("endsAt"));
  const timezone = formText(form.get("timezone")).trim();
  const startsAt = localEventTimeToUtc(startsAtLocal, timezone);
  const endsAt = localEventTimeToUtc(endsAtLocal, timezone);
  const capacityText = formText(form.get("capacity")).trim();
  const capacity = capacityText ? Number(capacityText) : null;
  if (
    title.length < 3 ||
    title.length > 120 ||
    summary.length < 20 ||
    summary.length > 300 ||
    description.length > 5000 ||
    !["online", "in_person", "hybrid"].includes(format) ||
    venue.length > 240 ||
    meetingUrl === null ||
    !isValidTimezone(timezone) ||
    startsAt === null ||
    endsAt === null ||
    !validEventTimes(startsAt, endsAt) ||
    (capacity !== null &&
      (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10000))
  )
    return {
      error:
        "Check the event details, timezone and time range. Times skipped by a daylight-saving change are not valid.",
    };
  if (format !== "in_person" && !meetingUrl)
    return { error: "Online and hybrid events require an HTTPS meeting URL." };
  if (format !== "online" && !venue)
    return { error: "In-person and hybrid events require a venue." };
  const id = crypto.randomUUID();
  const slug = await uniqueEventSlug(db, title);
  await db.batch([
    db
      .prepare(
        `INSERT INTO events
         (id, host_user_id, slug, title, summary, description, format,
          venue, meeting_url, starts_at, ends_at, timezone, capacity, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
      )
      .bind(
        id,
        user.id,
        slug,
        title,
        summary,
        description,
        format,
        venue,
        meetingUrl ?? "",
        startsAt,
        endsAt,
        timezone,
        capacity,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id)
         VALUES (?, ?, 'event.submitted', 'event', ?)`,
      )
      .bind(crypto.randomUUID(), user.id, id),
  ]);
  throw redirect(`/events/${slug}?submitted=1`);
}

export default function EventNew({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main event-editor-main">
        <header className="event-editor-intro">
          <AkariMotif motif="invitation" />
          <div>
            <span className="eyebrow">Event host desk</span>
            <h1>Propose a gathering.</h1>
            <p>
              Every invitation is reviewed before it enters the public House.
            </p>
          </div>
        </header>
        <Form method="post" className="profile-form event-form">
          {actionData?.error && (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          )}
          <label>
            Event title
            <input name="title" minLength={3} maxLength={120} required />
          </label>
          <label>
            Summary
            <textarea
              name="summary"
              minLength={20}
              maxLength={300}
              rows={3}
              required
            />
          </label>
          <label>
            Full description
            <textarea name="description" maxLength={5000} rows={8} />
          </label>
          <div className="form-row">
            <label>
              Format
              <select name="format" defaultValue="online">
                <option value="online">Online</option>
                <option value="in_person">In person</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
            <label>
              Capacity
              <input name="capacity" type="number" min={1} max={10000} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Starts in the event timezone
              <input name="startsAt" type="datetime-local" required />
            </label>
            <label>
              Ends in the event timezone
              <input name="endsAt" type="datetime-local" required />
            </label>
          </div>
          <EventTimezoneField />
          <label>
            Venue
            <input name="venue" maxLength={240} />
          </label>
          <label>
            HTTPS meeting URL
            <input name="meetingUrl" type="url" />
          </label>
          <button
            className="button button-primary"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "idle"
              ? "Submit for review"
              : "Submitting event..."}
          </button>
        </Form>
      </main>
    </div>
  );
}
