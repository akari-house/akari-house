import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  commonEventTimezones,
  eventTimeIso,
  formatEventTime,
  isValidTimezone,
} from "~/lib/events";

export function EventTimeDisplay({
  startsAt,
  timezone,
  showViewerTime = true,
}: {
  startsAt: string;
  timezone: string;
  showViewerTime?: boolean;
}) {
  const viewerTimezone = useSyncExternalStore(
    () => () => undefined,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    () => null,
  );
  const differentViewerTimezone =
    viewerTimezone &&
    isValidTimezone(viewerTimezone) &&
    viewerTimezone !== timezone
      ? viewerTimezone
      : null;

  return (
    <span className="event-time">
      <time dateTime={eventTimeIso(startsAt)}>
        {formatEventTime(startsAt, timezone)} ({timezone})
      </time>
      {showViewerTime && differentViewerTimezone && (
        <small>
          Your time: {formatEventTime(startsAt, differentViewerTimezone)} (
          {differentViewerTimezone})
        </small>
      )}
    </span>
  );
}

export function EventTimezoneField({
  defaultValue,
}: {
  defaultValue?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultValue || inputRef.current?.value) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (inputRef.current)
      inputRef.current.value =
        detected && isValidTimezone(detected) ? detected : "UTC";
  }, [defaultValue]);

  return (
    <label>
      Event timezone
      <input
        ref={inputRef}
        name="timezone"
        defaultValue={defaultValue ?? ""}
        list="event-timezones"
        placeholder="Europe/Berlin"
        autoComplete="off"
        required
      />
      <datalist id="event-timezones">
        {commonEventTimezones.map((item) => (
          <option value={item} key={item} />
        ))}
      </datalist>
      <small>
        Use an IANA timezone such as Europe/Berlin. Daylight-saving changes are
        handled automatically.
      </small>
    </label>
  );
}
