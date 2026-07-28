import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  "app/components/InvestorHouseSidebar.tsx",
  "utf8",
);
const deals = readFileSync("app/routes/deals.tsx", "utf8");
const room = readFileSync("app/routes/deal-room.tsx", "utf8");
const styles = readFileSync(
  "app/styles/investor-house-reference.css",
  "utf8",
);

describe("Investor House reference-led interface", () => {
  it("uses only real AKARI destinations in the persistent sidebar", () => {
    for (const destination of [
      "/app",
      "/members",
      "/projects",
      "/campaigns",
      "/events",
      "/deals",
      "/connections",
      "/notifications",
      "/settings/investor",
      "/settings/account",
    ])
      expect(sidebar).toContain(destination);
  });

  it("keeps catalogue actions connected to the existing Deals route", () => {
    expect(deals).toContain("InvestorHouseSidebar");
    expect(deals).toContain('method="post"');
    expect(deals).toContain('value={opportunity.savedAt ? "clear-state" : "save"}');
    expect(deals).toContain("loaderData.navigationCounts");
  });

  it("keeps the secure Deal Room sections and server-backed actions", () => {
    expect(room).toContain("InvestorHouseSidebar");
    expect(room).toContain('id="documents"');
    expect(room).toContain('value="request-access"');
    expect(room).toContain('value="request-introduction"');
    expect(room).toContain('value="ask-question"');
  });

  it("provides desktop, tablet and mobile layouts", () => {
    expect(styles).toContain(".investor-house-sidebar");
    expect(styles).toContain("grid-template-columns: repeat(3");
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toContain("@media (max-width: 640px)");
  });
});
