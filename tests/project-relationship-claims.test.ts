import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isClaimableProjectRelationshipType,
  projectSlugFromReference,
} from "../app/lib/project-relationships.server";

const read = (path: string) => readFileSync(path, "utf8");

describe("R76D project relationship claims", () => {
  it("adds additive relationship states without rewriting project ownership", () => {
    const migration = read("migrations/0112_project_relationship_claims.sql");
    expect(migration).toContain("CREATE TABLE project_relationships");
    expect(migration).toContain("'self_declared'");
    expect(migration).toContain("'pending'");
    expect(migration).toContain("'verified'");
    expect(migration).toContain("'disputed'");
    expect(migration).toContain("'revoked'");
    expect(migration).toContain("Backfilled from the existing canonical project owner");
    expect(migration).not.toContain("UPDATE projects SET founder_user_id");
  });

  it("records new Founder-created projects as self-declared", () => {
    const route = read("app/routes/project-new.tsx");
    expect(route).toContain("INSERT INTO project_relationships");
    expect(route).toContain("'founder', 'self_declared'");
  });

  it("requires evidence before a Founder relationship enters review", () => {
    const route = read("app/routes/project-claim.tsx");
    expect(route).toContain('requireApprovedMember(request, db)');
    expect(route).toContain('user.roles.includes("founder")');
    expect(route).toContain("validEvidenceUrl");
    expect(route).toContain("evidenceNote.length < 30");
    expect(route).toContain("claim_status = 'pending'");
    expect(route).toContain("project.relationship_claimed");
    expect(route).not.toContain("INSERT INTO project_collaborators");
  });

  it("keeps project relationship decisions in the projects admin scope", () => {
    const route = read("app/routes/admin-project-claims.tsx");
    expect(route).toContain('requireAdminScope(request, db, "projects")');
    expect(route).toContain("assertSameOrigin(request)");
    expect(route).toContain("project.relationship_decision");
  });

  it("grants manager access only after eligible claims are verified", () => {
    const route = read("app/routes/admin-project-claims.tsx");
    expect(route).toContain("managementRelationships");
    expect(route).toContain("INSERT INTO project_collaborators");
    expect(route).toContain('intent === "verify"');
    expect(route).not.toContain("UPDATE projects SET founder_user_id");
  });

  it("surfaces relationship status and claim entry points to Founders and admins", () => {
    const manage = read("app/routes/project-manage.tsx");
    const workspace = read("app/lib/admin-workspace.ts");
    const routes = read("app/routes.ts");
    expect(manage).toContain("Claim existing project");
    expect(manage).toContain("projectClaimStatusLabel");
    expect(workspace).toContain('label: "Project claims"');
    expect(routes).toContain('route("projects/claim"');
    expect(routes).toContain('route("admin/project-claims"');
  });

  it("normalizes project URLs and rejects unsupported relationship claims", () => {
    expect(projectSlugFromReference("alpha-project")).toBe("alpha-project");
    expect(projectSlugFromReference("/projects/alpha-project")).toBe(
      "alpha-project",
    );
    expect(
      projectSlugFromReference("https://akarihouse.com/projects/alpha-project"),
    ).toBe("alpha-project");
    expect(projectSlugFromReference("https://example.com/alpha-project")).toBeNull();
    expect(isClaimableProjectRelationshipType("founder")).toBe(true);
    expect(isClaimableProjectRelationshipType("advisor")).toBe(false);
  });
});
