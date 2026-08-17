import { describe, expect, it } from "vitest";
import { calculateFundraisingReadiness } from "../app/lib/fundraising-readiness";

const completeInput = {
  projectProfileComplete: true,
  founderVerified: true,
  raiseTarget: 500000,
  raiseCurrency: "USD",
  fundingInstrument: "safe",
  tractionSummary: "The company has live users, paying customers and repeat usage.",
  keyMetrics: "MRR 25000, 18% MoM growth",
  useOfFunds: "Product, growth, hiring and regulated market expansion.",
  monthlyBurn: 30000,
  runwayMonths: 12,
  capTableReady: true,
  pitchDeckReady: true,
  onePagerReady: true,
  financialsReady: true,
  corporateDocsReady: true,
  tokenRelevant: false,
  tokenomicsReady: false,
};

describe("fundraising readiness", () => {
  it("scores a complete non-token raise at 100 percent", () => {
    const readiness = calculateFundraisingReadiness(completeInput);
    expect(readiness.score).toBe(100);
    expect(readiness.missing).toHaveLength(0);
    expect(readiness.canPrepareOpportunity).toBe(true);
  });

  it("adds tokenomics only when token fundraising is relevant", () => {
    const withoutTokenomics = calculateFundraisingReadiness({
      ...completeInput,
      tokenRelevant: true,
      tokenomicsReady: false,
    });
    expect(withoutTokenomics.total).toBe(11);
    expect(withoutTokenomics.missing.map((item) => item.key)).toContain("tokenomics");

    const withTokenomics = calculateFundraisingReadiness({
      ...completeInput,
      tokenRelevant: true,
      tokenomicsReady: true,
    });
    expect(withTokenomics.score).toBe(100);
  });

  it("does not permit opportunity preparation from a high score without founder verification", () => {
    const readiness = calculateFundraisingReadiness({
      ...completeInput,
      founderVerified: false,
    });
    expect(readiness.score).toBe(90);
    expect(readiness.canPrepareOpportunity).toBe(false);
  });

  it("treats the score as completeness rather than investment quality", () => {
    const readiness = calculateFundraisingReadiness({
      ...completeInput,
      tractionSummary: "",
      keyMetrics: "",
      useOfFunds: "",
    });
    expect(readiness.missing.map((item) => item.key)).toEqual(
      expect.arrayContaining(["traction", "use_of_funds"]),
    );
    expect(readiness.score).toBeLessThan(100);
  });
});
