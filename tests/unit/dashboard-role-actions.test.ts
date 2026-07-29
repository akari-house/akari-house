import { describe, expect, it } from "vitest";
import { dashboardRoleActions } from "~/components/DashboardRoleActions";
import type { SessionUser } from "~/lib/domain";

function memberWithRoles(roles: SessionUser["roles"]): SessionUser {
  return {
    id: "member-1",
    username: "akari-member",
    displayName: "AKARI Member",
    accessTier: "member",
    roles,
  };
}

describe("role-first dashboard actions", () => {
  it("takes Creators directly to campaigns", () => {
    const actions = dashboardRoleActions(memberWithRoles(["creator"]));
    expect(actions[0]).toMatchObject({
      eyebrow: "Creator workspace",
      title: "Find Creator campaigns",
      to: "/campaigns",
    });
  });

  it("takes Investors directly to Deal discovery", () => {
    const actions = dashboardRoleActions(memberWithRoles(["investor"]));
    expect(actions[0]).toMatchObject({
      eyebrow: "Investor workspace",
      title: "Review matched Deals",
      to: "/deals",
    });
  });

  it("keeps each selected role distinct for multi-role members", () => {
    const actions = dashboardRoleActions(
      memberWithRoles(["founder", "creator", "investor"]),
    );

    expect(actions.slice(0, 3).map((action) => action.to)).toEqual([
      "/projects/manage",
      "/campaigns",
      "/deals",
    ]);
  });
});
