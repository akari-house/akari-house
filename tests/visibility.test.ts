import { describe, expect, it } from "vitest";
import { canViewProfile } from "~/lib/visibility";

describe("profile visibility", () => {
  const anonymous = { ownerId: "owner", viewerId: null, isConnected: false };
  const member = { ownerId: "owner", viewerId: "member", isConnected: false };
  const connection = {
    ownerId: "owner",
    viewerId: "member",
    isConnected: true,
  };
  const owner = { ownerId: "owner", viewerId: "owner", isConnected: false };

  it("allows public profiles for everyone", () =>
    expect(canViewProfile("public", anonymous)).toBe(true));
  it("requires login for members-only profiles", () => {
    expect(canViewProfile("members", anonymous)).toBe(false);
    expect(canViewProfile("members", member)).toBe(true);
  });
  it("requires an accepted connection for connection profiles", () => {
    expect(canViewProfile("connections", member)).toBe(false);
    expect(canViewProfile("connections", connection)).toBe(true);
  });
  it("keeps private profiles owner-only", () => {
    expect(canViewProfile("private", member)).toBe(false);
    expect(canViewProfile("private", owner)).toBe(true);
  });
});
