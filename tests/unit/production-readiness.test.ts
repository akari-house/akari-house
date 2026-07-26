import { describe, expect, it } from "vitest";
import {
  evaluateProductionReadiness,
  productionCheckDefinitions,
  productionCheckIsFresh,
  type ProductionCheckRecord,
} from "../../app/lib/production-readiness";

const now = new Date("2026-07-26T12:00:00.000Z");

function passedChecks(): ProductionCheckRecord[] {
  return productionCheckDefinitions.map((definition) => ({
    checkKey: definition.key,
    status: "passed",
    reviewedAt: "2026-07-25T12:00:00.000Z",
    expiresAt: "2026-08-25T12:00:00.000Z",
  }));
}

describe("production readiness", () => {
  it("requires a fresh passed review", () => {
    expect(
      productionCheckIsFresh(
        {
          checkKey: "email_delivery",
          status: "passed",
          reviewedAt: "2026-07-25T12:00:00.000Z",
          expiresAt: "2026-08-25T12:00:00.000Z",
        },
        30,
        now,
      ),
    ).toBe(true);
    expect(
      productionCheckIsFresh(
        {
          checkKey: "email_delivery",
          status: "passed",
          reviewedAt: "2026-06-01T12:00:00.000Z",
          expiresAt: "2026-07-01T12:00:00.000Z",
        },
        30,
        now,
      ),
    ).toBe(false);
  });

  it("opens the invited pilot only when public and human evidence are current", () => {
    const result = evaluateProductionReadiness({
      publicAudit: {
        status: "passed",
        completedAt: "2026-07-26T11:00:00.000Z",
        commitSha: "abc123",
      },
      manualChecks: passedChecks(),
      criticalFindings: 0,
      unresolvedFindings: 0,
      pilot: { status: "planning", stage: "internal" },
      now,
    });

    expect(result.readyForPilot).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.manualPassed).toBe(productionCheckDefinitions.length);
  });

  it("blocks launch for stale audits, missing checks and high findings", () => {
    const result = evaluateProductionReadiness({
      publicAudit: {
        status: "passed",
        completedAt: "2026-07-01T11:00:00.000Z",
        commitSha: "old",
      },
      manualChecks: passedChecks().slice(0, 2),
      criticalFindings: 1,
      unresolvedFindings: 3,
      pilot: { status: "active", stage: "invited_15" },
      now,
    });

    expect(result.readyForPilot).toBe(false);
    expect(result.publicAuditFresh).toBe(false);
    expect(result.blockers).toContain("Current public production audit");
    expect(result.blockers).toContain("1 critical or high-severity finding(s)");
  });

  it("requires a completed clean pilot before expansion", () => {
    const base = {
      publicAudit: {
        status: "passed" as const,
        completedAt: "2026-07-26T11:00:00.000Z",
        commitSha: "abc123",
      },
      manualChecks: passedChecks(),
      criticalFindings: 0,
      unresolvedFindings: 0,
      now,
    };

    expect(
      evaluateProductionReadiness({
        ...base,
        pilot: { status: "active", stage: "invited_15" },
      }).readyToExpand,
    ).toBe(false);
    expect(
      evaluateProductionReadiness({
        ...base,
        pilot: { status: "completed", stage: "invited_15" },
      }).readyToExpand,
    ).toBe(true);
  });
});
