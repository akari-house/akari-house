import { describe, expect, it } from "vitest";
import { connectionStateFromRow } from "~/lib/network.server";

describe("connection state normalization", () => {
  it("treats declined relationships as available for a new request", () => {
    expect(
      connectionStateFromRow(
        { requesterId: "viewer", status: "declined" },
        "viewer",
      ),
    ).toBe("none");
  });

  it("keeps pending direction and accepted or blocked states explicit", () => {
    expect(
      connectionStateFromRow(
        { requesterId: "viewer", status: "pending" },
        "viewer",
      ),
    ).toBe("outgoing_pending");
    expect(
      connectionStateFromRow(
        { requesterId: "other", status: "pending" },
        "viewer",
      ),
    ).toBe("incoming_pending");
    expect(
      connectionStateFromRow(
        { requesterId: "other", status: "accepted" },
        "viewer",
      ),
    ).toBe("connected");
    expect(
      connectionStateFromRow(
        { requesterId: "other", status: "blocked" },
        "viewer",
      ),
    ).toBe("blocked");
  });

  it("fails closed to no active relationship for unknown states", () => {
    expect(
      connectionStateFromRow(
        { requesterId: "viewer", status: "unexpected" },
        "viewer",
      ),
    ).toBe("none");
  });
});
