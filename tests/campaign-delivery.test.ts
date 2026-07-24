import { describe, expect, it } from "vitest";
import {
  campaignPayoutSuggestion,
  expectedCampaignSlots,
} from "../app/lib/campaign-delivery";

describe("campaign delivery requirements", () => {
  it("creates four requirements for each started weekly period", () => {
    const slots = expectedCampaignSlots(
      "2026-08-03",
      "2026-08-16",
      "weekly_4",
      new Date("2026-08-16T12:00:00.000Z"),
    );
    expect(slots).toHaveLength(8);
    expect(slots[0]).toEqual({ periodStart: "2026-08-03", slotNumber: 1 });
    expect(slots[7]).toEqual({ periodStart: "2026-08-10", slotNumber: 4 });
  });

  it("creates one requirement per day for daily engagement", () => {
    expect(
      expectedCampaignSlots(
        "2026-08-01",
        "2026-08-03",
        "daily_engagement",
        new Date("2026-08-03T12:00:00.000Z"),
      ),
    ).toHaveLength(3);
  });

  it("does not expose future requirements", () => {
    expect(
      expectedCampaignSlots(
        "2026-08-10",
        "2026-08-20",
        "daily_posting",
        new Date("2026-08-03T12:00:00.000Z"),
      ),
    ).toEqual([]);
  });

  it("suggests a proportional payout and never exceeds allocation", () => {
    expect(campaignPayoutSuggestion(100_000, 10, 8)).toBe(80_000);
    expect(campaignPayoutSuggestion(100_000, 10, 12)).toBe(100_000);
    expect(campaignPayoutSuggestion(100_000, 10, -2)).toBe(0);
  });
});
