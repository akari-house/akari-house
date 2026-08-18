import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync("app/routes/dashboard.tsx", "utf8");
const investorSidebar = readFileSync(
  "app/components/InvestorHouseSidebar.tsx",
  "utf8",
);
const siteHeader = readFileSync("app/components/SiteHeader.tsx", "utf8");
const authLayout = readFileSync("app/layouts/AuthLayout.tsx", "utf8");
const publicFooter = readFileSync("app/components/PublicFooter.tsx", "utf8");

describe("profile score and AKARI navigation consistency", () => {
  it("accepts the complete XScore scale in the browser and server action", () => {
    expect(dashboard).toContain("xScore > 1_000");
    expect(dashboard).not.toContain("sorsaScore > 100");
    expect(dashboard).toContain("max={1_000}");
    expect(dashboard).toContain('placeholder="0 to 1,000"');
    expect(dashboard).toContain('placeholder="0 or higher"');
    expect(dashboard).toContain("Values can exceed 100.");
    expect(dashboard).toContain('errorCode: "reputation" as const');
    expect(dashboard).toContain('actionData.errorCode === "reputation"');
  });

  it("uses one House header/account navigation model instead of the shared sidebar", () => {
    expect(existsSync("app/components/HouseWorkspaceSidebar.tsx")).toBe(false);
    expect(siteHeader).not.toContain("HouseWorkspaceSidebar");
    expect(siteHeader).toContain('aria-label="Your AKARI account"');
    expect(siteHeader).toContain('className="header-account-link"');
    expect(siteHeader).toContain("My House");
    expect(investorSidebar).toContain("return null");
  });

  it("makes every visible AKARI brand mark return to the public House home", () => {
    expect(siteHeader).toContain('className="wordmark"');
    expect(siteHeader).toContain('to="/"');
    expect(authLayout).toContain('className="auth-brand" to="/"');
    expect(publicFooter).toContain('className="footer-brand"');
    expect(publicFooter).toContain('aria-label="AKARI House footer home"');
  });
});
