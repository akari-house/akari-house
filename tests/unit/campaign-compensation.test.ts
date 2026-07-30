import { describe, expect, it } from "vitest";
import {
  allocateCampaignBudget,
  parseCampaignPlatforms,
  type CampaignCandidate,
} from "~/lib/campaign-compensation";

const weights = { x: 70, youtube: 30, tiktok: 0, instagram: 0 };

function candidate(
  id: string,
  overrides: Partial<CampaignCandidate> = {},
): CampaignCandidate {
  return {
    id,
    selectedPlatforms: ["x"],
    followers: { x: 10_000, youtube: 0, tiktok: 0, instagram: 0 },
    xScore: 500,
    sorsaScore: 500,
    postingDays: [1, 3, 5],
    engagementAccepted: true,
    ...overrides,
  };
}

describe("campaign compensation", () => {
  it("gives the strongest verified Creator the ceiling and lower scores less", () => {
    const result = allocateCampaignBudget(
      [
        candidate("strong", {
          followers: { x: 100_000, youtube: 0, tiktok: 0, instagram: 0 },
          xScore: 900,
          sorsaScore: 900,
        }),
        candidate("middle", {
          followers: { x: 40_000, youtube: 0, tiktok: 0, instagram: 0 },
          xScore: 650,
          sorsaScore: 650,
        }),
        candidate("lower", {
          followers: { x: 5_000, youtube: 0, tiktok: 0, instagram: 0 },
          xScore: 300,
          sorsaScore: 300,
        }),
      ],
      {
        budgetCents: 100_000,
        bonusPoolCents: 15_000,
        maximumAllocationCents: 10_000,
        platformWeights: weights,
        postingCadence: "weekly_3",
        dailyEngagementRequired: true,
      },
    );
    const strong = result.find((item) => item.id === "strong")!;
    const middle = result.find((item) => item.id === "middle")!;
    const lower = result.find((item) => item.id === "lower")!;
    expect(strong.payoutCents).toBe(10_000);
    expect(middle.payoutCents).toBeLessThan(strong.payoutCents);
    expect(lower.payoutCents).toBeLessThan(middle.payoutCents);
  });

  it("never exceeds the base allocation pool or the individual ceiling", () => {
    const result = allocateCampaignBudget(
      Array.from({ length: 20 }, (_, index) =>
        candidate(`creator-${index}`, {
          followers: {
            x: 100_000 - index * 2_000,
            youtube: 0,
            tiktok: 0,
            instagram: 0,
          },
          xScore: 900 - index * 20,
          sorsaScore: 900 - index * 20,
        }),
      ),
      {
        budgetCents: 100_000,
        bonusPoolCents: 15_000,
        maximumAllocationCents: 10_000,
        platformWeights: weights,
        postingCadence: "weekly_3",
        dailyEngagementRequired: true,
      },
    );
    expect(
      result.reduce((sum, item) => sum + item.payoutCents, 0),
    ).toBeLessThanOrEqual(85_000);
    expect(result.every((item) => item.payoutCents <= 10_000)).toBe(true);
  });

  it("uses XScore and Sorsa only for Creators who selected X", () => {
    const result = allocateCampaignBudget(
      [
        candidate("youtube-a", {
          selectedPlatforms: ["youtube"],
          followers: { x: 0, youtube: 20_000, tiktok: 0, instagram: 0 },
          xScore: 0,
          sorsaScore: 0,
        }),
        candidate("youtube-b", {
          selectedPlatforms: ["youtube"],
          followers: { x: 0, youtube: 10_000, tiktok: 0, instagram: 0 },
          xScore: 1_000,
          sorsaScore: 1_000,
        }),
      ],
      {
        budgetCents: 20_000,
        bonusPoolCents: 0,
        maximumAllocationCents: 10_000,
        platformWeights: { x: 0, youtube: 100, tiktok: 0, instagram: 0 },
        postingCadence: "weekly_3",
        dailyEngagementRequired: false,
      },
    );
    expect(
      result.find((item) => item.id === "youtube-a")!.payoutCents,
    ).toBeGreaterThan(
      result.find((item) => item.id === "youtube-b")!.payoutCents,
    );
  });

  it("falls back safely when stored platform JSON is invalid", () => {
    expect(parseCampaignPlatforms("not-json")).toEqual(["x"]);
  });
});
