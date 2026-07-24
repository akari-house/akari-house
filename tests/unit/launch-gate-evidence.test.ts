import { describe, expect, it } from "vitest";
import { launchGateDecision, validEvidenceReference } from "../../app/lib/launch-gate-evidence";

describe("launch gate evidence", () => {
  it("requires evidence for passed checks", () => {
    expect(launchGateDecision("passed", "").valid).toBe(false);
    expect(launchGateDecision("passed", "ticket-123").valid).toBe(true);
  });

  it("rejects unsafe or empty references", () => {
    expect(validEvidenceReference("ok")).toBe(false);
    expect(validEvidenceReference("report\nsecret")).toBe(false);
    expect(validEvidenceReference("evidence-42")).toBe(true);
  });
});
