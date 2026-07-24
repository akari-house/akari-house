import { describe, expect, it } from "vitest";
import { isWithinRateLimit } from "~/lib/rate-limit.server";

describe("action rate limits", () => {
  it("allows requests through the configured limit", () => {
    expect(isWithinRateLimit(1, 5)).toBe(true);
    expect(isWithinRateLimit(5, 5)).toBe(true);
  });

  it("rejects missing counters and attempts beyond the limit", () => {
    expect(isWithinRateLimit(null, 5)).toBe(false);
    expect(isWithinRateLimit(6, 5)).toBe(false);
  });
});
