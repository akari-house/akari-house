import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Superadmin project ownership transfer", () => {
  it("creates private collaborator access separate from public team members", () => {
    const migration = read("migrations/0111_project_ownership_transfer.sql");
    expect(migration).toContain("CREATE TABLE project_collaborators");
    expect(migration).not.toContain("project_team_members");
  });

  it("requires an active approved and verified Founder as the new owner", () => {
    const route = read("app/routes/admin-interests.tsx");
    expect(route).toContain("Project ownership transferred to you");
    expect(route).toContain("rv.status = 'verified'");
    expect(route).toContain("previousOwnerAccess");
    expect(route).toContain("project.ownership_transferred");
  });

  it("supports retaining or removing the previous owner's access", () => {
    const route = read("app/routes/admin-interests.tsx");
    expect(route).toContain('value="collaborator"');
    expect(route).toContain('value="remove"');
    expect(route).toContain("INSERT INTO project_collaborators");
    expect(route).toContain("DELETE FROM project_collaborators");
  });

  it("extends real project-management permissions to collaborators", () => {
    const helper = read("app/lib/project-access.server.ts");
    const manage = read("app/routes/project-manage.tsx");
    const editor = read("app/routes/project-edit.tsx");
    const dealRoom = read("app/routes/deal-room.tsx");
    const diligence = read("app/routes/project-diligence.tsx");
    expect(helper).toContain("requireProjectManagerBySlug");
    expect(manage).toContain("project_collaborators");
    expect(editor).toContain("requireProjectManagerBySlug");
    expect(dealRoom).toContain("userCanManageProject");
    expect(diligence).toContain("userCanManageProject");
  });

  it("keeps ownership transfer restricted to the projects admin scope", () => {
    const route = read("app/routes/admin-interests.tsx");
    expect(route).toContain('requireAdminScope(request, db, "projects")');
    expect(route).toContain("assertSameOrigin(request)");
  });
});
