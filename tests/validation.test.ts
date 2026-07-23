import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  normalizeWebsite,
  validateEmail,
  validateUsername,
} from "~/lib/validation";

describe("registration validation", () => {
  it("normalizes email addresses", () =>
    expect(normalizeEmail("  PERSON@Example.com ")).toBe("person@example.com"));
  it("rejects malformed email addresses", () =>
    expect(validateEmail("not-an-email")).toBe(false));
  it("accepts safe usernames", () =>
    expect(validateUsername("akari-member")).toBe(true));
  it("rejects unsafe usernames", () =>
    expect(validateUsername("AKARI member!")).toBe(false));
  it("accepts HTTPS profile websites", () =>
    expect(normalizeWebsite("https://akari.club")).toBe("https://akari.club/"));
  it("rejects non-HTTPS profile websites", () =>
    expect(normalizeWebsite("http://example.com")).toBeNull());
});
