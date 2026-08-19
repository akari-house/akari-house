import { describe, expect, it } from "vitest";
import { dashboardRoleActions } from "~/components/DashboardRoleActions";
import type { SessionUser } from "~/lib/domain";

function member(roles: SessionUser["roles"]): SessionUser {
  return {
    id: "member-1",
    email: "member@example.com",
    username: "member",
    displayName: "Member",
    status: "active",
    accessTier: "member",
    roles,
    adminAccess: null,
  };
}

describe("R91 House Compass", () => {
  it("keeps each member role to three ordered decisions", () => {
    for (const role of ["founder", "creator", "investor"] as const) {
      expect(dashboardRoleActions(member([role]), role)).toHaveLength(3);
    }
  });

  it("puts Investor opportunity discovery before preferences", () => {
    const actions = dashboardRoleActions(member(["investor"]), "investor");
    expect(actions[0]?.to).toBe("/deals");
    expect(actions[1]?.to).toBe("/settings/investor");
  });

  it("routes Creators from readiness to campaigns to Founders", () => {
    const actions = dashboardRoleActions(member(["creator"]), "creator");
    expect(actions[0]?.to).toBe("/app#profile-editor");
    expect(actions[1]?.to).toBe("/campaigns");
    expect(actions[2]?.to).toBe("/members?role=founder");
  });

  it("allows a multi-role member to change intent without changing identity", () => {
    const user = member(["founder", "creator", "investor"]);
    expect(dashboardRoleActions(user, "founder")[0]?.to).toBe(
      "/projects/manage",
    );
    expect(dashboardRoleActions(user, "creator")[0]?.to).toBe(
      "/app#profile-editor",
    );
    expect(dashboardRoleActions(user, "investor")[0]?.to).toBe("/deals");
  });
});
