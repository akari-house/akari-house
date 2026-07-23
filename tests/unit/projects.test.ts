import { describe, expect, it } from "vitest";
import { slugifyProject } from "../../app/lib/projects.server";

describe("project slugs", () => {
  it("creates stable URL-safe slugs", () => {
    expect(slugifyProject("  Akari’s Creator Studio!  ")).toBe(
      "akari-s-creator-studio",
    );
  });

  it("removes accents and constrains length", () => {
    expect(slugifyProject("Café lumière")).toBe("cafe-lumiere");
    expect(slugifyProject("A".repeat(100))).toHaveLength(60);
  });
});
