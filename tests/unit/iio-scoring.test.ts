import { describe, expect, it } from "vitest";
import {
  distributeIioBudget,
  validateIioWeights,
} from "../../app/lib/iio-scoring";

describe("IIO scoring", () => {
  const weights = { followers: 40, xScore: 30, sorsaScore: 30 };

  it("requires weights to total 100", () => {
    expect(validateIioWeights(weights)).toBe(true);
    expect(
      validateIioWeights({ followers: 40, xScore: 40, sorsaScore: 40 }),
    ).toBe(false);
  });

  it("distributes every cent and rewards stronger combined performance", () => {
    const result = distributeIioBudget(
      [
        { id: "a", xFollowers: 1_000, xScore: 40, sorsaScore: 20 },
        { id: "b", xFollowers: 50_000, xScore: 90, sorsaScore: 80 },
        { id: "c", xFollowers: 20_000, xScore: 70, sorsaScore: 60 },
      ],
      500_000,
      weights,
    );
    expect(result.reduce((sum, row) => sum + row.payoutCents, 0)).toBe(500_000);
    expect(result.find((row) => row.id === "b")!.payoutCents).toBeGreaterThan(
      result.find((row) => row.id === "c")!.payoutCents,
    );
  });

  it("splits equally when every metric is tied", () => {
    const result = distributeIioBudget(
      [
        { id: "a", xFollowers: 10, xScore: 10, sorsaScore: 10 },
        { id: "b", xFollowers: 10, xScore: 10, sorsaScore: 10 },
      ],
      101,
      weights,
    );
    expect(result.map((row) => row.payoutCents).sort()).toEqual([50, 51]);
  });
});
