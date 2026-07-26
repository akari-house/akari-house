import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sources = {
  projects: readFileSync("app/routes/projects.tsx", "utf8"),
  deals: readFileSync("app/routes/deals.tsx", "utf8"),
  campaigns: readFileSync("app/routes/campaigns.tsx", "utf8"),
  events: readFileSync("app/routes/events.tsx", "utf8"),
};

describe("public directory resilience", () => {
  it("keeps project, campaign and event directories available after enhanced query failures", () => {
    expect(sources.projects).toContain(
      "Project directory fallback query failed",
    );
    expect(sources.campaigns).toContain(
      "Campaign directory fallback query failed",
    );
    expect(sources.events).toContain("Event directory fallback query failed");
  });

  it("probes the full opportunity catalogue schema before querying deals", () => {
    for (const marker of [
      "opportunity_listings",
      "opportunity_user_states",
      "data_room_requests",
      "raise_minimum",
      "minimum_participation",
    ])
      expect(sources.deals).toContain(marker);
  });

  it("allows every public directory to render a safe empty state", () => {
    expect(sources.projects).toContain("return [] as PublicProjectRow[]");
    expect(sources.campaigns).toContain("return [] as PublicCampaignRow[]");
    expect(sources.events).toContain("return [] as PublicEventRow[]");
    expect(sources.deals).toContain("opportunities: [] as OpportunityRow[]");
  });
});
