import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync("app/routes/home.tsx", "utf8");
const footerSource = readFileSync("app/components/PublicFooter.tsx", "utf8");

describe("public Inari homepage isolation", () => {
  it("does not depend on unreleased opportunity or Investor tables", () => {
    expect(homeSource).not.toMatch(/opportunity_/);
    expect(homeSource).not.toContain("investor_profiles");
    expect(homeSource).not.toContain("PublicCommunityProof");
  });

  it("preserves the approved AKARI House journey", () => {
    for (const expected of [
      "Welcome to AKARI House",
      "HouseHall",
      "HouseInMotion",
      "BlossomJourney",
      "FeaturedArchiveCarousel",
      "MembershipDesk",
    ])
      expect(homeSource).toContain(expected);
  });

  it("keeps the footer compact and free of dense legal columns", () => {
    expect(footerSource).toContain('className="site-footer"');
    expect(footerSource).not.toContain("footer-risk-grid");
    expect(footerSource).not.toContain("public-footer");
  });
});
