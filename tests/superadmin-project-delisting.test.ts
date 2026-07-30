import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Superadmin project delisting", () => {
  it("lists published projects for ongoing Superadmin control", () => {
    const route = read("app/routes/admin-interests.tsx");
    expect(route).toContain("Published projects");
    expect(route).toContain('value="delist"');
    expect(route).toContain("Reason for delisting");
    expect(route).toContain("Delist project");
  });

  it("archives the project and its linked Deal Room listing", () => {
    const route = read("app/routes/admin-interests.tsx");
    expect(route).toContain("SET status = 'archived'");
    expect(route).toContain("UPDATE opportunity_listings");
    expect(route).toContain('"project.delisted"');
    expect(route).toContain("linkedOpportunityArchived");
  });

  it("keeps delisted records private without deleting history", () => {
    const projects = read("app/routes/projects.tsx");
    const deals = read("app/routes/deal-room.tsx");
    const admin = read("app/routes/admin-interests.tsx");
    expect(projects).toContain("WHERE pr.status = 'published'");
    expect(deals).toContain("AND pr.status = 'published'");
    expect(deals).toContain("AND ol.status = 'published'");
    expect(admin).not.toContain("DELETE FROM projects");
    expect(admin).toContain("Return to review");
  });
});
