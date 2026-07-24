import { describe, expect, it, vi } from "vitest";
import { resilienceStatus } from "../../app/lib/operational-resilience.server";

describe("resilienceStatus", () => {
  it("requires an initial recovery test", () => {
    expect(resilienceStatus(null)).toBe("not_tested");
  });

  it("surfaces failed operational runs", () => {
    expect(
      resilienceStatus({
        status: "failed",
        startedAt: new Date().toISOString(),
      }),
    ).toBe("attention");
  });

  it("marks recent successful runs ready", () => {
    expect(
      resilienceStatus({
        status: "passed",
        startedAt: new Date().toISOString(),
      }),
    ).toBe("ready");
  });

  it("marks old successful runs stale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00Z"));
    expect(
      resilienceStatus({ status: "passed", startedAt: "2026-07-20T12:00:00Z" }),
    ).toBe("stale");
    vi.useRealTimers();
  });
});
