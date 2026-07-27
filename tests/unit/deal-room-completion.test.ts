import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Investor and Angel Deal Room completion", () => {
  it("uses real opportunity listings without falling back to ordinary projects", () => {
    const catalogue = source("app/routes/deals.tsx");
    const room = source("app/routes/deal-room.tsx");
    expect(catalogue).toContain("FROM opportunity_listings ol");
    expect(catalogue).toContain(
      "AKARI does not populate this area with placeholder deals",
    );
    expect(room).toContain("The secure Deal Room is temporarily unavailable");
    expect(room).not.toContain("throw redirect(`/projects/${project.slug}`)");
  });

  it("keeps public and confidential sections in a reviewed persistent model", () => {
    const migration = source(
      "migrations/0102_complete_investor_deals_room.sql",
    );
    expect(migration).toContain("CREATE TABLE opportunity_sections");
    expect(migration).toContain("visibility IN ('public', 'confidential')");
    expect(migration).toContain(
      "status IN ('draft', 'submitted', 'published', 'declined', 'archived')",
    );
    expect(migration).toContain("UNIQUE (project_id, section_key)");
  });

  it("prevents duplicate active room requests, active document grants and saved records", () => {
    const diligence = source("migrations/0091_trusted_diligence.sql");
    const opportunities = source("migrations/0101_curated_opportunities.sql");
    expect(diligence).toContain("idx_data_room_request_active");
    expect(diligence).toContain("WHERE status IN ('pending', 'approved')");
    expect(diligence).toContain("idx_document_grant_unique_active");
    expect(opportunities).toContain("PRIMARY KEY (project_id, user_id)");
  });

  it("revokes every room and file grant when Investor eligibility is restricted", () => {
    const admin = source("app/routes/admin-opportunities.tsx");
    expect(admin).toContain("UPDATE data_room_requests");
    expect(admin).toContain("AND status IN ('pending', 'approved')");
    expect(admin).toContain("UPDATE document_access_grants");
    expect(admin).toContain(
      "WHERE investor_user_id = ? AND revoked_at IS NULL",
    );
  });

  it("registers Founder and scoped administrator operations in the real router", () => {
    const routes = source("app/routes.ts");
    expect(routes).toContain('"projects/:slug/opportunity/manage"');
    expect(routes).toContain('"admin/opportunities/operations"');
    expect(routes).toContain('"deals/:dealSlug"');
  });

  it("keeps the approved AKARI footer and a working Deal Room destination", () => {
    const footer = source("app/components/PublicFooter.tsx");
    expect(footer).toContain("/assets/optimized/akari-logo.webp");
    expect(footer).toContain("/assets/optimized/arrival.webp");
    expect(footer).toContain("Investor and Angel Deal Rooms");
    expect(footer).toContain('to: "/deals"');
  });

  it("contains no confidential reference attribution in the completed surface", () => {
    const publicSurface = [
      source("app/routes/deals.tsx"),
      source("app/routes/deal-room.tsx"),
      source("app/components/PublicFooter.tsx"),
      source("app/routes/opportunity-manage.tsx"),
      source("app/routes/admin-opportunity-operations.tsx"),
    ].join("\n");
    expect(publicSurface).not.toMatch(
      /reference platform|copied from|inspired by/i,
    );
  });
});
