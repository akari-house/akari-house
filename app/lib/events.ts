const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export const commonEventTimezones = [
  "UTC",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
] as const;

function dateInUtc(value: string) {
  const normalized = value.includes("T")
    ? value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value)
      ? value
      : `${value}Z`
    : `${value.replace(" ", "T")}Z`;
  return new Date(normalized);
}

function partsInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
}

export function isValidTimezone(timezone: string) {
  if (!timezone || timezone.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function localEventTimeToUtc(localValue: string, timezone: string) {
  const match = localDateTimePattern.exec(localValue);
  if (!match || !isValidTimezone(timezone)) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const desired = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
  const targetAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );
  if (
    !Number.isFinite(targetAsUtc) ||
    new Date(targetAsUtc).getUTCFullYear() !== desired.year ||
    new Date(targetAsUtc).getUTCMonth() !== desired.month - 1 ||
    new Date(targetAsUtc).getUTCDate() !== desired.day
  )
    return null;

  let instant = targetAsUtc;
  for (let pass = 0; pass < 3; pass += 1) {
    const represented = partsInTimezone(new Date(instant), timezone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    instant += targetAsUtc - representedAsUtc;
  }
  const verified = partsInTimezone(new Date(instant), timezone);
  if (
    verified.year !== desired.year ||
    verified.month !== desired.month ||
    verified.day !== desired.day ||
    verified.hour !== desired.hour ||
    verified.minute !== desired.minute
  )
    return null;
  return new Date(instant).toISOString().slice(0, 19).replace("T", " ");
}

export function eventTimeToLocalInput(utcValue: string, timezone: string) {
  if (!isValidTimezone(timezone)) return "";
  const date = dateInUtc(utcValue);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = partsInTimezone(date, timezone);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${two(parts.month)}-${two(parts.day)}T${two(parts.hour)}:${two(parts.minute)}`;
}

export function eventTimeIso(utcValue: string) {
  const date = dateInUtc(utcValue);
  return Number.isFinite(date.getTime()) ? date.toISOString() : utcValue;
}

export function formatEventTime(
  utcValue: string,
  timezone: string,
  locale = "en",
) {
  const date = dateInUtc(utcValue);
  if (!Number.isFinite(date.getTime()) || !isValidTimezone(timezone))
    return utcValue;
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function validEventTimes(startsAt: string, endsAt: string) {
  const start = dateInUtc(startsAt).getTime();
  const end = dateInUtc(endsAt).getTime();
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    start > Date.now() - 5 * 60_000
  );
}
