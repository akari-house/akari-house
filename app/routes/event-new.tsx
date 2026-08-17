import { useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/event-new";
import { AkariMotif } from "~/components/AkariMotif";
import { EventTimezoneField } from "~/components/EventTimeDisplay";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { importEventImage } from "~/lib/event-image.server";
import {
  canHostEvents,
  canPublishEventsDirectly,
  uniqueEventSlug,
} from "~/lib/events.server";
import {
  isValidTimezone,
  localEventTimeToUtc,
  validEventTimes,
} from "~/lib/events";
import { validateProfilePhoto } from "~/lib/profile-photo.server";
import {
  markManagedR2ObjectDeleted,
  registerManagedR2Object,
} from "~/lib/r2-lifecycle.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, normalizeWebsite } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!(await canHostEvents(db, user.id)))
    throw new Response("Approved event-host access is required.", {
      status: 403,
    });
  return { user, canPublishDirectly: canPublishEventsDirectly(user) };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const env = context.get(cloudflareContext).env;
  const db = env.DB;
  const user = await requireApprovedMember(request, db);
  if (!(await canHostEvents(db, user.id)))
    throw new Response("Approved event-host access is required.", {
      status: 403,
    });
  const publishDirectly = canPublishEventsDirectly(user);
  const nextStatus = publishDirectly ? "published" : "submitted";

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 2_750_000)
    return { error: "Event cover images must be 2 MB or smaller." };

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
  const image = form.get("image");
  const imageUrl = formText(form.get("imageUrl")).trim();
  if (image instanceof File && image.size && imageUrl)
    return { error: "Choose either an image upload or an image URL." };

  let imageKey: string | null = null;
  let imageSourceUrl = "";
  if (image instanceof File && image.size) {
    const validImage = await validateProfilePhoto(image);
    if (!validImage)
      return { error: "Use a JPG, PNG or WebP image no larger than 2 MB." };
    imageKey = `event-images/${id}/${crypto.randomUUID()}.${validImage.extension}`;
    await env.MEDIA.put(imageKey, image.stream(), {
      httpMetadata: { contentType: validImage.contentType },
    });
  } else if (imageUrl) {
    try {
      const imported = await importEventImage(imageUrl);
      imageKey = `event-images/${id}/${crypto.randomUUID()}.${imported.extension}`;
      imageSourceUrl = imported.sourceUrl;
      await env.MEDIA.put(imageKey, imported.bytes, {
        httpMetadata: { contentType: imported.contentType },
      });
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "The image link is invalid.",
      };
    }
  }

  try {
    if (imageKey)
      await registerManagedR2Object(db, {
        objectKey: imageKey,
        sourceType: "event_image",
        sourceId: id,
        ownerUserId: user.id,
      });

    await db.batch([
      db
        .prepare(
          `INSERT INTO events
           (id, host_user_id, slug, title, summary, description, format,
            venue, meeting_url, starts_at, ends_at, timezone, capacity,
            image_key, image_source_url, status, reviewed_by, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   CASE WHEN ? = 'published' THEN datetime('now') ELSE NULL END)`,
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
          imageKey,
          imageSourceUrl,
          nextStatus,
          publishDirectly ? user.id : null,
          nextStatus,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, ?, 'event', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          publishDirectly ? "event.published_directly" : "event.submitted",
          id,
          JSON.stringify({
            hasImage: Boolean(imageKey),
            status: nextStatus,
            publishingAccess: publishDirectly ? "admin" : "review_required",
          }),
        ),
    ]);
  } catch (error) {
    if (imageKey) {
      await env.MEDIA.delete(imageKey);
      await markManagedR2ObjectDeleted(db, imageKey).catch(() => undefined);
    }
    throw error;
  }

  throw redirect(
    publishDirectly
      ? `/events/${slug}?published=1`
      : `/events/${slug}?submitted=1`,
  );
}

export default function EventNew({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const [eventFormat, setEventFormat] = useState("online");
  const canPublishDirectly = loaderData.canPublishDirectly;

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main event-editor-main">
        <header className="event-editor-intro">
          <AkariMotif motif="invitation" />
          <div>
            <span className="eyebrow">
              {canPublishDirectly ? "AKARI event publishing" : "Event host desk"}
            </span>
            <h1>{canPublishDirectly ? "Publish a gathering." : "Propose a gathering."}</h1>
            <p>
              {canPublishDirectly
                ? "Your AKARI admin access can publish this event directly to the public House."
                : "Every invitation is reviewed before it enters the public House."}
            </p>
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
          {canPublishDirectly && (
            <p className="notice">
              Publish now is enabled for your AKARI admin account. The event will
              become public immediately after validation succeeds.
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
          <label className="event-image-field">
            Event cover image
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
            />
            <small>
              Optional. Use a landscape JPG, PNG or WebP up to 2 MB. For reviewed
              events the image remains private until approval.
            </small>
          </label>
          <label>
            Or import a cover from an HTTPS image link
            <input
              name="imageUrl"
              type="url"
              inputMode="url"
              placeholder="https://example.com/event-cover.jpg"
            />
            <small>
              AKARI securely copies the image into private storage. Local and
              private-network addresses are blocked.
            </small>
          </label>

          <div className="form-row">
            <label>
              Format
              <select
                name="format"
                value={eventFormat}
                onChange={(event) => setEventFormat(event.currentTarget.value)}
              >
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

          {eventFormat !== "online" && (
            <label>
              Venue
              <input name="venue" maxLength={240} required />
            </label>
          )}
          {eventFormat !== "in_person" && (
            <label>
              HTTPS meeting URL
              <input name="meetingUrl" type="url" required />
            </label>
          )}

          <button
            className="button button-primary"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "idle"
              ? canPublishDirectly
                ? "Publish event"
                : "Submit for review"
              : canPublishDirectly
                ? "Publishing event..."
                : "Submitting event..."}
          </button>
        </Form>
      </main>
    </div>
  );
}
