import { Form, redirect } from "react-router";
import type { Route } from "./+types/event-edit";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { validEventTimes } from "~/lib/events.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, normalizeWebsite } from "~/lib/validation";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const event = await db
    .prepare(
      `SELECT slug, title, summary, description, format, venue,
              meeting_url AS meetingUrl, starts_at AS startsAt,
              ends_at AS endsAt, capacity, status
       FROM events WHERE slug = ? AND host_user_id = ?`,
    )
    .bind(params.slug, user.id)
    .first<{
      slug: string;
      title: string;
      summary: string;
      description: string;
      format: string;
      venue: string;
      meetingUrl: string;
      startsAt: string;
      endsAt: string;
      capacity: number | null;
      status: string;
    }>();
  if (!event) throw new Response("Event not found.", { status: 404 });
  return { user, event };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const existing = await db
    .prepare(
      "SELECT id, status FROM events WHERE slug = ? AND host_user_id = ?",
    )
    .bind(params.slug, user.id)
    .first<{ id: string; status: string }>();
  if (!existing) throw new Response("Event not found.", { status: 404 });
  if (intent === "cancel") {
    await db
      .prepare(
        `UPDATE events SET status = 'cancelled',
         updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(existing.id)
      .run();
    throw redirect("/events/manage");
  }
  const title = formText(form.get("title")).trim();
  const summary = formText(form.get("summary")).trim();
  const description = formText(form.get("description")).trim();
  const format = formText(form.get("format"));
  const venue = formText(form.get("venue")).trim();
  const meetingUrl = normalizeWebsite(form.get("meetingUrl"));
  const startsAt = formText(form.get("startsAt"));
  const endsAt = formText(form.get("endsAt"));
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
    !validEventTimes(startsAt, endsAt) ||
    (capacity !== null &&
      (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10000))
  )
    return { error: "Check the event fields and time range." };
  if (format !== "in_person" && !meetingUrl)
    return { error: "Online and hybrid events require a meeting URL." };
  if (format !== "online" && !venue)
    return { error: "In-person and hybrid events require a venue." };
  await db
    .prepare(
      `UPDATE events SET title = ?, summary = ?, description = ?,
       format = ?, venue = ?, meeting_url = ?, starts_at = ?, ends_at = ?,
       capacity = ?, status = 'submitted', updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      title,
      summary,
      description,
      format,
      venue,
      meetingUrl ?? "",
      startsAt,
      endsAt,
      capacity,
      existing.id,
    )
    .run();
  throw redirect(`/events/${params.slug}`);
}

export default function EventEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const event = loaderData.event;
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <span className="eyebrow">Event editor · {event.status}</span>
        <h1>Refine the gathering.</h1>
        <Form method="post" className="profile-form">
          {actionData?.error && <p className="form-error">{actionData.error}</p>}
          <label>
            Title
            <input name="title" defaultValue={event.title} maxLength={120} />
          </label>
          <label>
            Summary
            <textarea
              name="summary"
              defaultValue={event.summary}
              minLength={20}
              maxLength={300}
              rows={3}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              defaultValue={event.description}
              maxLength={5000}
              rows={8}
            />
          </label>
          <div className="form-row">
            <label>
              Format
              <select name="format" defaultValue={event.format}>
                <option value="online">Online</option>
                <option value="in_person">In person</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
            <label>
              Capacity
              <input
                name="capacity"
                type="number"
                min={1}
                max={10000}
                defaultValue={event.capacity ?? ""}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Starts (UTC)
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={event.startsAt.slice(0, 16)}
              />
            </label>
            <label>
              Ends (UTC)
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={event.endsAt.slice(0, 16)}
              />
            </label>
          </div>
          <label>
            Venue
            <input name="venue" defaultValue={event.venue} maxLength={240} />
          </label>
          <label>
            Meeting URL
            <input
              name="meetingUrl"
              type="url"
              defaultValue={event.meetingUrl}
            />
          </label>
          <button
            className="button button-primary"
            name="intent"
            value="submit"
          >
            Save and submit for review
          </button>
          {event.status !== "cancelled" && (
            <button
              className="button button-quiet"
              name="intent"
              value="cancel"
              formNoValidate
            >
              Cancel event
            </button>
          )}
        </Form>
      </main>
    </div>
  );
}
