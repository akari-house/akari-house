import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("R96 project detail and pilot console", () => {
  it("keeps proven project actions while upgrading the project presentation", () => {
    const routes = readFileSync("app/routes.ts", "utf8");
    const detail = readFileSync("app/routes/project-detail-v2.tsx", "utf8");

    expect(routes).toContain(
      'route("projects/:slug", "routes/project-detail-v2.tsx")',
    );
    expect(detail).toContain("loader as projectLoader");
    expect(detail).toContain("action as projectAction");
    expect(detail).toContain("project-detail-banner");
    expect(detail).toContain("project-detail-logo");
    expect(detail).toContain("Manage project");
    expect(detail).toContain("Follow project");
    expect(detail).toContain("Express interest");
  });

  it("adds a superadmin-only Seed the House readiness surface", () => {
    const routes = readFileSync("app/routes.ts", "utf8");
    const workspace = readFileSync("app/lib/admin-workspace.ts", "utf8");
    const seed = readFileSync("app/routes/admin-seed-house.tsx", "utf8");

    expect(routes).toContain(
      'route("admin/seed-house", "routes/admin-seed-house.tsx")',
    );
    expect(workspace).toContain('key: "seed-house"');
    expect(workspace).toContain('to: "/admin/seed-house"');
    expect(seed).toContain("requireSuperAdmin");
    expect(seed).toContain("Controlled pilot readiness");
    expect(seed).toContain("3 discovery-ready published Projects");
    expect(seed).toContain("5 campaign-ready Creators");
  });

  it("keeps Creator campaign readiness independent from membership approval", () => {
    const seed = readFileSync("app/routes/admin-seed-house.tsx", "utf8");

    expect(seed).toContain(
      "JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'creator'",
    );
    expect(seed).toContain("AS approvedMember");
    expect(seed).toContain("Creator profiles checked");
    expect(seed).toContain("COALESCE(r.x_score_source, '') <> 'unavailable'");
    expect(seed).toContain("COALESCE(r.sorsa_source, '') <> 'unavailable'");
    expect(seed).toContain("All active Creator profiles meet campaign eligibility data");
  });

  it("does not introduce a migration or CRM dependency", () => {
    const detail = readFileSync("app/routes/project-detail-v2.tsx", "utf8");
    const seed = readFileSync("app/routes/admin-seed-house.tsx", "utf8");

    expect(detail).not.toContain("CRM_");
    expect(seed).not.toContain("CRM_");
    expect(seed).toContain("buildProjectReadiness");
  });
});
