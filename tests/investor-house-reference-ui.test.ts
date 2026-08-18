import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync("app/components/InvestorHouseSidebar.tsx", "utf8");
const deals = readFileSync("app/routes/deals.tsx", "utf8");
const room = readFileSync("app/routes/deal-room.tsx", "utf8");
const headerStyles = readFileSync(
  "app/styles/r82-investor-house-header.css",
  "utf8",
);

describe("Investor House navigation boundary", () => {
  it("retires the fixed CRM-style Investor rail", () => {
    expect(sidebar).toContain("return null");
    expect(sidebar).toContain("standard AKARI SiteHeader");
    expect(sidebar).not.toContain("investor-house-sidebar-link");
    expect(headerStyles).toContain(
      ".investor-house-shell > .site-header",
    );
    expect(headerStyles).toContain("display: flex !important");
  });

  it("keeps catalogue actions connected to the existing Deals route", () => {
    expect(deals).toContain("InvestorHouseSidebar");
    expect(deals).toContain("SiteHeader");
    expect(deals).toContain('method="post"');
    expect(deals).toContain(
      'value={opportunity.savedAt ? "clear-state" : "save"}',
    );
    expect(deals).toContain("loaderData.navigationCounts");
  });

  it("keeps the secure Deal Room sections and server-backed actions", () => {
    expect(room).toContain("InvestorHouseSidebar");
    expect(room).toContain("SiteHeader");
    expect(room).toContain('className="deal-room-tabs"');
    expect(room).toContain('id="documents"');
    expect(room).toContain('value="request-access"');
    expect(room).toContain('value="request-introduction"');
    expect(room).toContain('value="ask-question"');
  });

  it("resets Deal Room content and footer to the normal House canvas", () => {
    expect(headerStyles).toContain("margin: 0 auto !important");
    expect(headerStyles).toContain("margin-left: 0 !important");
    expect(headerStyles).toContain("@media (max-width: 700px)");
  });
});
