import { describe, expect, it, vi } from "vitest";
import { validEventTimes } from "../../app/lib/events.server";

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
});
