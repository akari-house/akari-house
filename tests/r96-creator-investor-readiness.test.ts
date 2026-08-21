import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("R96.3 Creator readiness and Investor discovery", () => {
  it("shows the four real Creator campaign readiness signals", () => {
    const panel = readFileSync(
      "app/components/CreatorReadinessPanel.tsx",
      "utf8",
    );
    const dashboard = readFileSync("app/routes/dashboard.tsx", "utf8");

    expect(panel).toContain("Primary X profile");
    expect(panel).toContain("X follower count");
    expect(panel).toContain("XScore");
    expect(panel).toContain("Sorsa score");
    expect(panel).toContain("There is no minimum follower threshold");
    expect(panel).toContain(
      "Campaign eligibility is based on Creator profile data",
    );
    expect(panel).toContain('accessTier === "member"');
    expect(dashboard).toContain("CreatorReadinessPanel");
    expect(dashboard).toContain('roles.includes("creator")');
  });

  it("keeps the existing campaign application eligibility gate intact", () => {
    const campaign = readFileSync("app/routes/campaign-detail.tsx", "utf8");

    expect(campaign).toContain("xAccount.followerCount !== null");
    expect(campaign).toContain('xScoreSource !== "unavailable"');
    expect(campaign).toContain('sorsaSource !== "unavailable"');
    expect(campaign).toContain('if (!user.roles.includes("creator"))');
  });

  it("adds existing project media to compact Investor opportunity discovery", () => {
    const deals = readFileSync("app/routes/deals.tsx", "utf8");
    const styles = readFileSync(
      "app/styles/r96-creator-investor-readiness.css",
      "utf8",
    );

    expect(deals).toContain("pr.logo_key AS logoKey");
    expect(deals).toContain("pr.banner_key AS bannerKey");
    expect(deals).toContain("deal-card-media");
    expect(deals).toContain("/media/projects/${opportunity.slug}/banner");
    expect(deals).toContain("/media/projects/${opportunity.slug}/logo");
    expect(styles).toContain("repeat(3, minmax(0, 1fr))");
    expect(styles).toContain("repeat(2, minmax(0, 1fr))");
  });

  it("does not weaken verified Investor access controls", () => {
    const deals = readFileSync("app/routes/deals.tsx", "utf8");

    expect(deals).toContain("requireApprovedMember");
    expect(deals).toContain("isVerifiedInvestor");
    expect(deals).toContain("Verified Investor access required");
    expect(deals).toContain("recordOpportunityAudit");
  });
});
