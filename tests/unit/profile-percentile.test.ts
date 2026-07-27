import { describe, expect, it } from "vitest";
import { calculateAkariPercentile } from "~/lib/profile-percentile";

const verified = (following: number, sorsaScore = following, xScore = following) => ({
  following,
  sorsaScore,
  xScore,
  followingSource: "official_api" as const,
  sorsaSource: "partner_verified" as const,
  xScoreSource: "partner_verified" as const,
});

describe("AKARI percentile", () => {
  it("ranks a member across the three weighted signals", () => {
    const population = [verified(10), verified(20), verified(30), verified(40), verified(50)];
    expect(calculateAkariPercentile(population[4], population)).toEqual({
      topPercent: 1,
      confidence: "verified",
    });
  });

  it("marks member-reported-only data as provisional", () => {
    const population = [10, 20, 30].map((following) => ({
      following,
      sorsaScore: null,
      xScore: null,
      followingSource: "member_reported" as const,
      sorsaSource: "unavailable" as const,
      xScoreSource: "unavailable" as const,
    }));
    expect(calculateAkariPercentile(population[2], population).confidence).toBe("provisional");
  });

  it("does not invent a percentile without a meaningful population", () => {
    expect(calculateAkariPercentile(verified(10), [verified(10)])).toEqual({
      topPercent: null,
      confidence: "insufficient",
    });
  });
});
