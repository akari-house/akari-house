import { describe, expect, it, vi } from "vitest";
import {
  eventTimeToLocalInput,
  formatEventTime,
  isValidTimezone,
  localEventTimeToUtc,
  validEventTimes,
} from "../../app/lib/events";

describe("event time validation", () => {
  it("requires an end after a future start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T00:00:00Z"));
    expect(
      validEventTimes("2026-07-25T10:00:00Z", "2026-07-25T11:00:00Z"),
    ).toBe(true);
    expect(
      validEventTimes("2026-07-25T11:00:00Z", "2026-07-25T10:00:00Z"),
    ).toBe(false);
    vi.useRealTimers();
  });

  it("rejects invalid dates", () => {
    expect(validEventTimes("not-a-date", "also-not-a-date")).toBe(false);
  });

  it("converts an event-local wall time to canonical UTC", () => {
    expect(localEventTimeToUtc("2026-07-25T10:00", "Europe/Berlin")).toBe(
      "2026-07-25 08:00:00",
    );
    expect(eventTimeToLocalInput("2026-07-25 08:00:00", "Europe/Berlin")).toBe(
      "2026-07-25T10:00",
    );
  });

  it("uses the correct daylight-saving offset for winter and summer", () => {
    expect(localEventTimeToUtc("2026-01-25T10:00", "Europe/Berlin")).toBe(
      "2026-01-25 09:00:00",
    );
    expect(localEventTimeToUtc("2026-07-25T10:00", "Europe/Berlin")).toBe(
      "2026-07-25 08:00:00",
    );
  });

  it("rejects nonexistent local times during the spring DST jump", () => {
    expect(localEventTimeToUtc("2026-03-29T02:30", "Europe/Berlin")).toBeNull();
  });

  it("validates IANA zones and formats legacy UTC rows compatibly", () => {
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidTimezone("Not/A_Timezone")).toBe(false);
    expect(
      formatEventTime("2026-07-25T08:00", "Europe/Berlin", "en-GB"),
    ).toContain("10:00");
  });
});
