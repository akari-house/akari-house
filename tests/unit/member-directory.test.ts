import { describe, expect, it } from "vitest";
import {
  isDiscoverableProfile,
  memberDirectoryFilters,
} from "~/lib/member-directory";

describe("member directory privacy", () => {
  it("limits applicants to public profiles", () => {
    expect(isDiscoverableProfile("public", "applicant", false)).toBe(true);
    expect(isDiscoverableProfile("members", "applicant", false)).toBe(false);
    expect(isDiscoverableProfile("connections", "applicant", true)).toBe(false);
    expect(isDiscoverableProfile("private", "applicant", false)).toBe(false);
  });

  it("shows members only the profiles eligible for their relationship", () => {
    expect(isDiscoverableProfile("public", "member", false)).toBe(true);
    expect(isDiscoverableProfile("members", "member", false)).toBe(true);
    expect(isDiscoverableProfile("connections", "member", false)).toBe(false);
    expect(isDiscoverableProfile("connections", "member", true)).toBe(true);
    expect(isDiscoverableProfile("private", "member", true)).toBe(false);
  });
});

describe("member directory filters", () => {
  it("normalizes filters and rejects unknown roles", () => {
    const filters = memberDirectoryFilters(
      new URL(
        "https://akari.example/members?q=%20climate%20&role=admin&location=Berlin&expertise=design",
      ),
    );
    expect(filters).toEqual({
      query: "climate",
      role: "",
      location: "Berlin",
      expertise: "design",
    });
  });

  it("accepts a supported role and bounds free-text input", () => {
    const url = new URL("https://akari.example/members");
    url.searchParams.set("role", "creator");
    url.searchParams.set("q", "a".repeat(120));
    const filters = memberDirectoryFilters(url);
    expect(filters.role).toBe("creator");
    expect(filters.query).toHaveLength(80);
  });
});
