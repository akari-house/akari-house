import { describe, expect, it } from "vitest";
import {
  launchGateEvidenceLabel,
  launchGateEvidenceState,
  type LaunchGateEvidenceSummary,
} from "../../app/lib/launch-gate-evidence";

const evidence: LaunchGateEvidenceSummary = {
  checkKey: "founder",
  source: "automated_preview",
  environment: "github-actions-preview",
  commitSha: "abc123",
  status: "passed",
  testedAt: "2026-07-25T12:00:00.000Z",
};

describe("launch gate automated evidence", () => {
  it("distinguishes preview evidence from production approval", () => {
    expect(
      launchGateEvidenceState(
        evidence,
        "abc123",
        new Date("2026-07-26T12:00:00.000Z").getTime(),
      ),
    ).toBe("preview_passed");
    expect(launchGateEvidenceLabel("automated_preview")).toBe(
      "Automated preview",
    );
  });

  it("marks evidence stale when the commit changes", () => {
    expect(
      launchGateEvidenceState(
        evidence,
        "def456",
        new Date("2026-07-26T12:00:00.000Z").getTime(),
      ),
    ).toBe("stale");
  });

  it("surfaces failed evidence immediately", () => {
    expect(
      launchGateEvidenceState(
        { ...evidence, status: "failed" },
        "abc123",
        new Date("2026-07-26T12:00:00.000Z").getTime(),
      ),
    ).toBe("failed");
  });
});
