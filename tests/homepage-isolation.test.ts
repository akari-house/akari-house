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

  it("keeps the production footer isolated from opportunity data", () => {
    expect(footerSource).toContain(
      'className="site-footer akari-footer"',
    );
    expect(footerSource).toContain("akari-footer-panorama.svg");
    expect(footerSource).not.toContain("opportunity_listings");
    expect(footerSource).not.toContain("investor_profiles");
  });
});
