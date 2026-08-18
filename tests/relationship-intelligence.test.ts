import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  prioritizeWarmPaths,
  relationshipDisplayName,
  relationshipNeedsAttention,
  relationshipStrengthRank,
} from "../app/lib/relationship-intelligence";

describe("R73 relationship intelligence", () => {
  it("uses an explicit human-readable strength ladder", () => {
    expect(relationshipStrengthRank("cold")).toBeLessThan(
      relationshipStrengthRank("warm"),
    );
    expect(relationshipStrengthRank("warm")).toBeLessThan(
      relationshipStrengthRank("trusted"),
    );
  });

  it("does not create follow-up pressure for opted-out or closed relationships", () => {
    const now = new Date("2026-08-17T12:00:00Z");
    expect(
      relationshipNeedsAttention({
        status: "active",
        consentStatus: "opted_out",
        nextActionAt: "2026-08-01T12:00:00Z",
        lastInteractionAt: "2026-06-01T12:00:00Z",
        now,
      }),
    ).toBe(false);
    expect(
      relationshipNeedsAttention({
        status: "closed",
        consentStatus: "granted",
        nextActionAt: "2026-08-01T12:00:00Z",
        lastInteractionAt: "2026-06-01T12:00:00Z",
        now,
      }),
    ).toBe(false);
  });

  it("flags overdue next actions and stale active relationships", () => {
    const now = new Date("2026-08-17T12:00:00Z");
    expect(
      relationshipNeedsAttention({
        status: "active",
        consentStatus: "granted",
        nextActionAt: "2026-08-16T12:00:00Z",
        lastInteractionAt: "2026-08-10T12:00:00Z",
        now,
      }),
    ).toBe(true);
    expect(
      relationshipNeedsAttention({
        status: "active",
        consentStatus: "unknown",
        nextActionAt: null,
        lastInteractionAt: "2026-07-01T12:00:00Z",
        now,
      }),
    ).toBe(true);
  });

  it("prioritizes the relationship owner in deterministic warm paths", () => {
    const paths = prioritizeWarmPaths([
      { userId: "2", displayName: "Yash", username: "yash", isOwner: false },
      { userId: "1", displayName: "Muaz", username: "muaz", isOwner: true },
      {
        userId: "3",
        displayName: "Madhav",
        username: "madhav",
        isOwner: false,
      },
    ]);
    expect(paths.map((path) => path.displayName)).toEqual([
      "Muaz",
      "Madhav",
      "Yash",
    ]);
  });

  it("prefers canonical member identity over internal fallback identity", () => {
    expect(
      relationshipDisplayName({
        memberName: "Investor Name",
        displayName: "CRM Alias",
        email: "investor@example.com",
      }),
    ).toBe("Investor Name");
  });

  it("keeps member connections and project claims canonical while adding internal CRM metadata", () => {
    const migration = readFileSync(
      "migrations/0119_relationship_intelligence.sql",
      "utf8",
    );
    expect(migration).toContain("CREATE TABLE relationship_records");
    expect(migration).toContain("CREATE TABLE relationship_interactions");
    expect(migration).toContain("subject_user_id");
    expect(migration).toContain("project_id");
    expect(migration).not.toContain("DROP TABLE connections");
    expect(migration).not.toContain("DROP TABLE project_relationships");
  });

  it("preserves relationship data while redirecting House relationship UI to AKARI CRM", () => {
    const routes = readFileSync("app/routes.ts", "utf8");
    const listBoundary = readFileSync(
      "app/routes/crm-boundary-relationships.ts",
      "utf8",
    );
    const detailBoundary = readFileSync(
      "app/routes/crm-boundary-relationship-detail.ts",
      "utf8",
    );
    expect(routes).toContain(
      'route("admin/relationships", "routes/crm-boundary-relationships.ts")',
    );
    expect(routes).toContain('"routes/crm-boundary-relationship-detail.ts"');
    expect(listBoundary).toContain('from "./crm-boundary-redirect"');
    expect(detailBoundary).toContain('from "./crm-boundary-redirect"');
  });
});
