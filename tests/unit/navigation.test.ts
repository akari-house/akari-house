import { describe, expect, it } from "vitest";
import { fallbackPath } from "~/lib/navigation";

describe("contextual back navigation", () => {
  it("returns detail screens to their collection", () => {
    expect(fallbackPath("/events/spring-table")).toBe("/events");
    expect(fallbackPath("/projects/akari-lantern")).toBe("/projects");
    expect(fallbackPath("/archive/a-founder-story")).toBe("/archive");
  });

  it("returns account screens to the dashboard", () => {
    expect(fallbackPath("/members")).toBe("/app");
    expect(fallbackPath("/notifications")).toBe("/app");
    expect(fallbackPath("/settings/telegram")).toBe("/app");
  });
});
