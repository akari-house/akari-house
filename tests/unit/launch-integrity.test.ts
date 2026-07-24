import { describe, expect, it } from "vitest";
import { cancellationOpensEventPlace } from "~/lib/event-registration";
import { legalPolicyVersions } from "~/lib/legal-consent.server";
import { isValidDecisionNote } from "~/lib/review";

describe("launch integrity policy", () => {
  it("versions every policy accepted at registration", () => {
    expect(Object.keys(legalPolicyVersions).sort()).toEqual([
      "community_guidelines",
      "privacy",
      "terms",
    ]);
    expect(Object.values(legalPolicyVersions).every(Boolean)).toBe(true);
    expect(new Set(Object.values(legalPolicyVersions))).toEqual(
      new Set(["2026-07-24"]),
    );
  });

  it("requires bounded review notes", () => {
    expect(isValidDecisionNote("Clear approval rationale.")).toBe(true);
    expect(isValidDecisionNote(" no ")).toBe(false);
    expect(isValidDecisionNote("x".repeat(501))).toBe(false);
  });

  it("promotes a waitlisted member only when a confirmed place opens", () => {
    expect(cancellationOpensEventPlace("registered")).toBe(true);
    expect(cancellationOpensEventPlace("waitlisted")).toBe(false);
    expect(cancellationOpensEventPlace("cancelled")).toBe(false);
  });
});
