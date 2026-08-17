import { describe, expect, it } from "vitest";
import {
  diligenceCompleteness,
  isDiligenceCategory,
  normalizeDiligenceCategory,
} from "../app/lib/diligence-completion";

describe("diligence completion", () => {
  it("treats the seven institutional categories as complete for non-token projects", () => {
    const readiness = diligenceCompleteness([
      "corporate",
      "legal",
      "financials",
      "product",
      "market",
      "team",
      "fundraising",
    ]);

    expect(readiness.percentage).toBe(100);
    expect(readiness.total).toBe(7);
    expect(readiness.missing).toHaveLength(0);
  });

  it("requires token material only when token or Web3 diligence is relevant", () => {
    const withoutTokenMaterial = diligenceCompleteness(
      [
        "corporate",
        "legal",
        "financials",
        "product",
        "market",
        "team",
        "fundraising",
      ],
      true,
    );

    expect(withoutTokenMaterial.total).toBe(8);
    expect(withoutTokenMaterial.missing).toEqual(["token_web3"]);

    const withTokenMaterial = diligenceCompleteness(
      [
        "corporate",
        "legal",
        "financials",
        "product",
        "market",
        "team",
        "fundraising",
        "token_web3",
      ],
      true,
    );

    expect(withTokenMaterial.percentage).toBe(100);
  });

  it("does not make token-only material a requirement for non-token projects", () => {
    const readiness = diligenceCompleteness([
      "corporate",
      "legal",
      "financials",
      "product",
      "market",
      "team",
      "fundraising",
      "token_web3",
    ]);

    expect(readiness.total).toBe(7);
    expect(readiness.percentage).toBe(100);
    expect(readiness.required).not.toContain("token_web3");
  });

  it("maps legacy document categories into the R72 institutional checklist", () => {
    expect(normalizeDiligenceCategory("company")).toBe("corporate");
    expect(normalizeDiligenceCategory("financial")).toBe("financials");
    expect(normalizeDiligenceCategory("traction")).toBe("market");
    expect(normalizeDiligenceCategory("tokenomics")).toBe("token_web3");
    expect(normalizeDiligenceCategory("risk")).toBe("legal");
  });

  it("does not double-count multiple documents in the same category", () => {
    const readiness = diligenceCompleteness([
      "company",
      "corporate",
      "financial",
      "financials",
    ]);

    expect(readiness.complete).toBe(2);
    expect(readiness.total).toBe(7);
  });

  it("does not count unknown or other material as a completed institutional category", () => {
    const readiness = diligenceCompleteness(["other", "unknown", "company"]);
    expect(readiness.complete).toBe(1);
    expect(readiness.missing).toContain("financials");
    expect(isDiligenceCategory("other")).toBe(false);
  });
});
