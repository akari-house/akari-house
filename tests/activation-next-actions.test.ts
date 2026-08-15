import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildAdminNextAction,
  buildMemberNextActions,
  type MemberActivationSnapshot,
} from "../app/lib/activation-next-actions";

const baseMember: MemberActivationSnapshot = {
  accessTier: "member",
  roles: [],
  profilePercent: 100,
  profileMissing: [],
  founderProjectCount: 0,
  founderDraftProjectCount: 0,
  founderPublishedProjectCount: 0,
  founderPendingClaimCount: 0,
  founderOutcomeActivationCount: 0,
  xProfileUrl: "",
  xFollowerCount: null,
  xScore: null,
  sorsaScore: null,
  creatorApplicationCount: 0,
  creatorAcceptedCampaignCount: 0,
  investorProfileStatus: null,
  investorPreferencesComplete: false,
  investorInterestCount: 0,
  investorProgressedCount: 0,
  unreadNotifications: 0,
  pendingConnections: 0,
};

describe("R76F/R76H member next action engine", () => {
  it("puts a Founder's first Project ahead of generic profile work", () => {
    const actions = buildMemberNextActions({
      ...baseMember,
      roles: ["founder"],
      profilePercent: 67,
      profileMissing: ["website", "expertise"],
    });

    expect(actions[0]?.key).toBe("founder-first-project");
    expect(actions[0]?.to).toBe("/projects/new");
    expect(actions.some((action) => action.key === "profile-readiness")).toBe(
      true,
    );
  });

  it("requires Creator X data completeness without a follower threshold", () => {
    const actions = buildMemberNextActions({
      ...baseMember,
      roles: ["creator"],
      xProfileUrl: "https://x.com/example",
      xFollowerCount: 0,
      xScore: null,
      sorsaScore: 0,
    });

    expect(actions[0]?.key).toBe("creator-readiness");
    expect(actions[0]?.description).toContain("XScore");
    expect(actions[0]?.description).toContain(
      "does not apply a follower threshold",
    );
  });

  it("moves a ready Creator with no application to Ambassador Campaign discovery", () => {
    const actions = buildMemberNextActions({
      ...baseMember,
      roles: ["creator"],
      xProfileUrl: "https://x.com/example",
      xFollowerCount: 0,
      xScore: 420,
      sorsaScore: 15,
    });

    expect(actions[0]?.key).toBe("creator-campaigns");
    expect(actions[0]?.to).toBe("/campaigns");
  });

  it("moves an accepted Creator back to campaign delivery instead of discovery", () => {
    const actions = buildMemberNextActions({
      ...baseMember,
      roles: ["creator"],
      xProfileUrl: "https://x.com/example",
      xFollowerCount: 0,
      xScore: 420,
      sorsaScore: 15,
      creatorApplicationCount: 2,
      creatorAcceptedCampaignCount: 1,
    });

    expect(actions[0]?.key).toBe("creator-campaign-status");
    expect(actions[0]?.title).toContain("accepted campaign work");
  });

  it("prompts a Founder to activate a published Project without a GTM or raise workflow", () => {
    const actions = buildMemberNextActions({
      ...baseMember,
      roles: ["founder"],
      founderProjectCount: 1,
      founderPublishedProjectCount: 1,
    });

    expect(actions[0]?.key).toBe("founder-activate-project");
    expect(actions[0]?.to).toBe("/projects/manage");
  });

  it("prioritizes incomplete Investor preferences for multi-role members", () => {
    const actions = buildMemberNextActions({
      ...baseMember,
      roles: ["founder", "investor"],
      founderProjectCount: 1,
      investorProfileStatus: "claimed",
    });

    expect(actions[0]?.key).toBe("investor-preferences");
    expect(actions[0]?.to).toBe("/settings/investor");
  });

  it("keeps a verified Investor focused on progressed relationships", () => {
    const actions = buildMemberNextActions({
      ...baseMember,
      roles: ["investor"],
      investorProfileStatus: "verified",
      investorPreferencesComplete: true,
      investorInterestCount: 2,
      investorProgressedCount: 1,
    });

    expect(actions[0]?.key).toBe("investor-interest-status");
    expect(actions[0]?.title).toContain("active Founder relationships");
  });

  it("surfaces pending connection decisions before low-priority discovery", () => {
    const actions = buildMemberNextActions({
      ...baseMember,
      roles: ["founder"],
      founderProjectCount: 1,
      founderOutcomeActivationCount: 1,
      pendingConnections: 2,
    });

    expect(actions[0]?.key).toBe("pending-connections");
    expect(actions[0]?.to).toBe("/connections");
  });
});

describe("R76F Superadmin next action engine", () => {
  it("routes Superadmin to the highest-priority active governance queue", () => {
    const result = buildAdminNextAction([
      {
        key: "campaigns",
        label: "Campaigns",
        description: "Campaign review",
        to: "/admin/campaigns",
        count: 8,
      },
      {
        key: "project-claims",
        label: "Project claims",
        description: "Relationship review",
        to: "/admin/project-claims",
        count: 2,
      },
      {
        key: "membership",
        label: "Membership",
        description: "Membership review",
        to: "/admin/applications",
        count: 1,
      },
    ]);

    expect(result.next?.key).toBe("membership");
    expect(result.remainingItemCount).toBe(11);
    expect(result.activeQueueCount).toBe(3);
  });

  it("does not treat team and directory inventory as review decisions", () => {
    const result = buildAdminNextAction([
      {
        key: "team",
        label: "Team",
        description: "Admins",
        to: "/admin/team",
        count: 4,
      },
      {
        key: "directory",
        label: "Directory",
        description: "Draft entries",
        to: "/admin/house-directory",
        count: 9,
      },
    ]);

    expect(result.next).toBeNull();
    expect(result.remainingItemCount).toBe(0);
  });
});

describe("R76F endpoint wiring", () => {
  it("keeps activation responses private and registers the endpoint", () => {
    const endpoint = readFileSync(
      "app/routes/activation-next-actions.ts",
      "utf8",
    );
    const routes = readFileSync("app/routes.ts", "utf8");

    expect(endpoint).toContain('"Cache-Control": "private, no-store"');
    expect(endpoint).toContain("requireUser(request, db)");
    expect(routes).toContain(
      'route("api/activation/next-actions", "routes/activation-next-actions.ts")',
    );
  });
});
