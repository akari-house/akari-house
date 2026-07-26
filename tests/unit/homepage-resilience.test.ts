import { describe, expect, it } from "vitest";
import { optionalHomepageValue } from "../../app/routes/home";

describe("homepage optional data resilience", () => {
  it("returns available optional data", async () => {
    await expect(
      optionalHomepageValue(async () => ({ title: "Available project" })),
    ).resolves.toEqual({ title: "Available project" });
  });

  it("returns null instead of taking down the public House", async () => {
    await expect(
      optionalHomepageValue(async () => {
        throw new Error("Optional production data is unavailable");
      }),
    ).resolves.toBeNull();
  });
});
