import { describe, expect, it } from "vitest";
import {
  canAccessDirectoryProfile,
  isDiscoverableProfile,
  memberDirectoryFilters,
  memberMatchesDirectoryFilters,
} from "~/lib/member-directory";

describe("member directory privacy", () => {
  it("limits applicants to public profiles", () => {
    expect(isDiscoverableProfile("public", "applicant")).toBe(true);
    expect(isDiscoverableProfile("members", "applicant")).toBe(false);
    expect(isDiscoverableProfile("connections", "applicant")).toBe(false);
    expect(isDiscoverableProfile("private", "applicant")).toBe(false);
  });

  it("lets approved members discover connection-gated profiles", () => {
    expect(isDiscoverableProfile("public", "member")).toBe(true);
    expect(isDiscoverableProfile("members", "member")).toBe(true);
    expect(isDiscoverableProfile("connections", "member")).toBe(true);
    expect(isDiscoverableProfile("private", "member")).toBe(false);
  });

  it("keeps connection-gated profile details locked until acceptance", () => {
    expect(canAccessDirectoryProfile("public", "member", false)).toBe(true);
    expect(canAccessDirectoryProfile("members", "member", false)).toBe(true);
    expect(canAccessDirectoryProfile("connections", "member", false)).toBe(
      false,
    );
    expect(canAccessDirectoryProfile("connections", "member", true)).toBe(
      true,
    );
    expect(canAccessDirectoryProfile("private", "member", true)).toBe(false);
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

  it("filters only against privacy-safe fields supplied by the route", () => {
    const member = {
      displayName: "Aiko Mori",
      username: "aiko",
      headline: "Creator partnerships",
      bio: "Building community programmes",
      expertise: "Growth design",
      location: "Berlin",
      roles: ["creator" as const],
    };
    expect(
      memberMatchesDirectoryFilters(member, {
        query: "community",
        role: "creator",
        location: "berlin",
        expertise: "growth",
      }),
    ).toBe(true);
    expect(
      memberMatchesDirectoryFilters(
        { ...member, headline: "", bio: "", expertise: "", location: "" },
        {
          query: "community",
          role: "creator",
          location: "",
          expertise: "",
        },
      ),
    ).toBe(false);
  });
});
