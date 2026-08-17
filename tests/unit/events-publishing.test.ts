import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canPublishEventsDirectly } from "../../app/lib/events.server";
import type { SessionUser } from "../../app/lib/domain";

const read = (path: string) => readFileSync(path, "utf8");

function member(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "member-1",
    username: "member",
    displayName: "AKARI Member",
    accessTier: "member",
    roles: [],
    ...overrides,
  };
}

describe("canPublishEventsDirectly", () => {
  it("allows a superadmin to publish an event without a second review hop", () => {
    expect(
      canPublishEventsDirectly(
        member({
          adminAccess: { accessLevel: "superadmin", scopes: [] },
        }),
      ),
    ).toBe(true);
  });

  it("allows an admin with the projects review scope", () => {
    expect(
      canPublishEventsDirectly(
        member({
          adminAccess: { accessLevel: "admin", scopes: ["projects"] },
        }),
      ),
    ).toBe(true);
  });

  it("keeps ordinary approved event hosts on the review path", () => {
    expect(canPublishEventsDirectly(member())).toBe(false);
  });

  it("does not grant direct publishing to unrelated admin scopes", () => {
    expect(
      canPublishEventsDirectly(
        member({
          adminAccess: { accessLevel: "admin", scopes: ["campaigns"] },
        }),
      ),
    ).toBe(false);
  });

  it("wires the direct-publish decision into create and edit routes", () => {
    const createRoute = read("app/routes/event-new.tsx");
    const editRoute = read("app/routes/event-edit.tsx");

    expect(createRoute).toContain("canPublishEventsDirectly(user)");
    expect(createRoute).toContain('"event.published_directly"');
    expect(createRoute).toContain(
      'nextStatus = publishDirectly ? "published" : "submitted"',
    );
    expect(createRoute).toContain('"Publish event"');

    expect(editRoute).toContain("canPublishEventsDirectly(user)");
    expect(editRoute).toContain('"event.published_directly"');
    expect(editRoute).toContain(
      'nextStatus = publishDirectly ? "published" : "submitted"',
    );
    expect(editRoute).toContain('"Save and publish"');
    expect(editRoute).toContain("Cancelled events cannot be republished");
  });
});
