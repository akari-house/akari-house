import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync("app/routes/dashboard.tsx", "utf8");
const houseSidebar = readFileSync(
  "app/components/HouseWorkspaceSidebar.tsx",
  "utf8",
);
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
    expect(dashboard).toContain("sorsaScore > 100");
    expect(dashboard).toContain("max={1_000}");
    expect(dashboard).toContain('placeholder="0 to 1,000"');
    expect(dashboard).toContain('errorCode: "reputation" as const');
    expect(dashboard).toContain('actionData.errorCode === "reputation"');
  });

  it("uses the URL hash so only the correct sidebar destination is active", () => {
    expect(houseSidebar).toContain(
      "function isActive(pathname: string, hash: string, item: WorkspaceItem)",
    );
    expect(houseSidebar).toContain(
      "if (itemHash) return pathname === path && hash === `#${itemHash}`",
    );
    expect(houseSidebar).toContain(
      'if (item.exact) return pathname === path && hash === ""',
    );
    expect(siteHeader).toContain("hash={location.hash}");
  });

  it("makes every AKARI brand mark return to the public House home", () => {
    expect(houseSidebar).toContain('className="house-workspace-sidebar-brand"');
    expect(houseSidebar).toContain('to="/"');
    expect(investorSidebar).toContain(
      'className="investor-house-sidebar-brand"',
    );
    expect(investorSidebar).toContain('to="/"');
    expect(siteHeader).toContain('className="wordmark"');
    expect(siteHeader).toContain('to="/"');
    expect(authLayout).toContain('className="auth-brand" to="/"');
    expect(publicFooter).toContain('className="footer-brand"');
    expect(publicFooter).toContain('aria-label="AKARI House home"');
  });
});
