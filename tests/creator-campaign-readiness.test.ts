import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/routes/campaign-detail.tsx", "utf8");

describe("Creator campaign readiness", () => {
  it("requires follower data without imposing a follower minimum", () => {
    expect(source).toContain("xAccount.followerCount !== null");
    expect(source).toContain("readiness.xFollowers === null");
    expect(source).toContain("There is no minimum follower count.");
    expect(source).toContain("Math.round(readiness.xFollowers)");
  });

  it("keeps campaign participation separate from AKARI membership approval", () => {
    const creatorGate = source.indexOf('if (!user.roles.includes("creator"))');
    const applicationWindow = source.indexOf("const today", creatorGate);
    const creatorAccessSection = source.slice(creatorGate, applicationWindow);

    expect(creatorGate).toBeGreaterThan(-1);
    expect(applicationWindow).toBeGreaterThan(creatorGate);
    expect(creatorAccessSection).not.toContain("accessTier");
  });

  it("shows snapshotted Creator metrics to the campaign owner", () => {
    expect(source).toContain("ca.x_followers AS xFollowers");
    expect(source).toContain("ca.x_score AS xScore");
    expect(source).toContain("ca.sorsa_score AS sorsaScore");
    expect(source).toContain('Followers: {application.xFollowers ?? "Unknown"}');
    expect(source).toContain('XScore: {application.xScore ?? "Unknown"}');
    expect(source).toContain('Sorsa: {application.sorsaScore ?? "Unknown"}');
  });
});
