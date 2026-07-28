import { Form, redirect, useNavigation } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/event-edit";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  eventTimeToLocalInput,
  isValidTimezone,
  localEventTimeToUtc,
  validEventTimes,
} from "~/lib/events";
import { EventTimezoneField } from "~/components/EventTimeDisplay";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, normalizeWebsite } from "~/lib/validation";
import { AkariMotif } from "~/components/AkariMotif";
import { canHostEvents } from "~/lib/events.server";
import { validateProfilePhoto } from "~/lib/profile-photo.server";
import {
  markManagedR2ObjectDeleted,
  registerManagedR2Object,
} from "~/lib/r2-lifecycle.server";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!(await canHostEvents(db, user.id)))
    throw new Response("Approved event-host access is required.", {
      status: 403,
    });
  const event = await db
    .prepare(
      `SELECT id, slug, title, summary, description, format, venue,
              meeting_url AS meetingUrl, starts_at AS startsAt,
              ends_at AS endsAt, timezone, capacity, status,
              image_key AS imageKey
       FROM events WHERE slug = ? AND host_user_id = ?`,
    )
    .bind(params.slug, user.id)
    .first<{
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
      status: string;
      imageKey: string | null;
    }>();
  if (!event) throw new Response("Event not found.", { status: 404 });
  return { user, event };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const env = context.get(cloudflareContext).env;
  const db = env.DB;
  const user = await requireApprovedMember(request, db);
  if (!(await canHostEvents(db, user.id)))
    throw new Response("Approved event-host access is required.", {
      status: 403,
    });
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 2_750_000)
    return { error: "Event cover images must be 2 MB or smaller." };
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const existing = await db
    .prepare(
      `SELECT id, status, title, image_key AS imageKey
       FROM events WHERE slug = ? AND host_user_id = ?`,
    )
    .bind(params.slug, user.id)
    .first<{
      id: string;
      status: string;
      title: string;
      imageKey: string | null;
    }>();
  if (!existing) throw new Response("Event not found.", { status: 404 });
  if (intent === "cancel") {
    const registrations = await db
      .prepare(
        `SELECT user_id AS userId FROM event_registrations
         WHERE event_id = ? AND status IN ('registered', 'waitlisted')`,
      )
      .bind(existing.id)
      .all<{ userId: string }>();
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = 'cancelled',
           updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(existing.id),
      db
        .prepare(
          `UPDATE event_registrations SET status = 'cancelled',
           updated_at = datetime('now')
           WHERE event_id = ? AND status IN ('registered', 'waitlisted')`,
        )
        .bind(existing.id),
      ...registrations.results.map(({ userId }) =>
        db
          .prepare(
            `INSERT INTO notifications
             (id, user_id, kind, title, body, action_url)
             VALUES (?, ?, 'event.cancelled', 'Event cancelled', ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            userId,
            `${existing.title} was cancelled by its host.`,
            `/events/${params.slug}`,
          ),
      ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'event.cancelled', 'event', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          existing.id,
          JSON.stringify({ notified: registrations.results.length }),
        ),
    ]);
    throw redirect("/events/manage?cancelled=1");
  }
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
        "Check the event fields, timezone and time range. Times skipped by a daylight-saving change are not valid.",
    };
  if (format !== "in_person" && !meetingUrl)
    return { error: "Online and hybrid events require a meeting URL." };
  if (format !== "online" && !venue)
    return { error: "In-person and hybrid events require a venue." };
  const confirmed = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM event_registrations
       WHERE event_id = ? AND status = 'registered'`,
    )
    .bind(existing.id)
    .first<{ total: number }>();
  if (capacity !== null && capacity < (confirmed?.total ?? 0))
    return {
      error: `Capacity cannot be lower than the ${confirmed?.total ?? 0} confirmed registrations.`,
    };

  const image = form.get("image");
  const removeImage = form.get("removeImage") === "yes";
  let imageKey = removeImage ? null : existing.imageKey;
  let uploadedImageKey: string | null = null;
  if (image instanceof File && image.size) {
    const validImage = await validateProfilePhoto(image);
    if (!validImage)
      return { error: "Use a JPG, PNG or WebP image no larger than 2 MB." };
    uploadedImageKey = `event-images/${existing.id}/${crypto.randomUUID()}.${validImage.extension}`;
    imageKey = uploadedImageKey;
    await env.MEDIA.put(uploadedImageKey, image.stream(), {
      httpMetadata: { contentType: validImage.contentType },
    });
  }

  try {
    if (uploadedImageKey)
      await registerManagedR2Object(db, {
        objectKey: uploadedImageKey,
        sourceType: "event_image",
        sourceId: existing.id,
        ownerUserId: user.id,
      });
    await db
      .prepare(
        `UPDATE events SET title = ?, summary = ?, description = ?,
         format = ?, venue = ?, meeting_url = ?, starts_at = ?, ends_at = ?,
         timezone = ?, capacity = ?, image_key = ?, status = 'submitted',
         updated_at = datetime('now')
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
        timezone,
        capacity,
        imageKey,
        existing.id,
      )
      .run();
  } catch (error) {
    if (uploadedImageKey) {
      await env.MEDIA.delete(uploadedImageKey);
      await markManagedR2ObjectDeleted(db, uploadedImageKey).catch(
        () => undefined,
      );
    }
    throw error;
  }

  if (existing.imageKey && existing.imageKey !== imageKey) {
    await env.MEDIA.delete(existing.imageKey);
    await markManagedR2ObjectDeleted(db, existing.imageKey);
  }
  throw redirect(`/events/${params.slug}?submitted=1`);
}

export default function EventEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const event = loaderData.event;
  const navigation = useNavigation();
  const [eventFormat, setEventFormat] = useState(event.format);
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main event-editor-main">
        <header className="event-editor-intro">
          <AkariMotif motif="invitation" />
          <div>
            <span className="eyebrow">Event editor · {event.status}</span>
            <h1>Refine the gathering.</h1>
            <p>Shape the invitation, timing and welcome before review.</p>
          </div>
        </header>
        <Form
          method="post"
          encType="multipart/form-data"
          className="profile-form event-form"
        >
          {actionData?.error && (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          )}
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
          <div className="event-image-field">
            <span>Event cover image</span>
            {event.imageKey && (
              <img
                src={`/media/events/${event.slug}`}
                alt={`${event.title} current cover`}
                width={960}
                height={540}
              />
            )}
            <label>
              {event.imageKey ? "Replace cover image" : "Add cover image"}
              <input
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </label>
            {event.imageKey && (
              <label className="inline-choice">
                <input type="checkbox" name="removeImage" value="yes" />
                Remove the current cover image
              </label>
            )}
            <small>
              Landscape JPG, PNG or WebP up to 2 MB. Changes return a published
              event to review.
            </small>
          </div>
          <div className="form-row">
            <label>
              Format
              <select
                name="format"
                value={eventFormat}
                onChange={(changeEvent) =>
                  setEventFormat(changeEvent.currentTarget.value)
                }
              >
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
              Starts in the event timezone
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={eventTimeToLocalInput(
                  event.startsAt,
                  event.timezone,
                )}
                required
              />
            </label>
            <label>
              Ends in the event timezone
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={eventTimeToLocalInput(
                  event.endsAt,
                  event.timezone,
                )}
                required
              />
            </label>
          </div>
          <EventTimezoneField defaultValue={event.timezone} />
          {event.status === "published" && (
            <p className="notice">
              Saving changes sends this event back for review and temporarily
              removes it from the public calendar.
            </p>
          )}
          {eventFormat !== "online" && (
            <label>
              Venue
              <input
                name="venue"
                defaultValue={event.venue}
                maxLength={240}
                required
              />
            </label>
          )}
          {eventFormat !== "in_person" && (
            <label>
              Meeting URL
              <input
                name="meetingUrl"
                type="url"
                defaultValue={event.meetingUrl}
                required
              />
            </label>
          )}
          <button
            className="button button-primary"
            name="intent"
            value="submit"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "idle"
              ? "Save and submit for review"
              : "Submitting changes..."}
          </button>
          {event.status !== "cancelled" && (
            <button
              className="button button-quiet"
              name="intent"
              value="cancel"
              formNoValidate
              disabled={navigation.state !== "idle"}
              onClick={(event) => {
                if (
                  !window.confirm(
                    "Cancel this event? It will leave the public calendar and registrations will no longer be active.",
                  )
                )
                  event.preventDefault();
              }}
            >
              Cancel event
            </button>
          )}
        </Form>
      </main>
    </div>
  );
}
