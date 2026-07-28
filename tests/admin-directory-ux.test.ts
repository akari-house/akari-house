import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("member directory and admin trust workflow", () => {
  it("uses a compact list by default with optional cards", () => {
    const members = read("app/routes/members.tsx");
    const styles = read("app/styles/admin-console.css");
    expect(members).toContain('? "grid" : "list"');
    expect(members).toContain('aria-label="Member result layout"');
    expect(members).toContain("Verify your Founder role");
    expect(members).toContain("Investor review pending");
    expect(styles).toContain(".member-card-grid.is-list");
  });

  it("backfills missing role claims for approved active members", () => {
    const migration = read("migrations/0108_role_verification_queue.sql");
    expect(migration).toContain("LEFT JOIN role_verifications rv");
    expect(migration).toContain("WHERE rv.user_id IS NULL");
    expect(migration).toContain("'pending'");
  });

  it("uses a compact verification queue with approve, hold and reject", () => {
    const verifications = read("app/routes/admin-verifications.tsx");
    expect(verifications).toContain('className="admin-review-list"');
    expect(verifications).toContain('className="admin-review-item"');
    expect(verifications).toContain('value="verify"');
    expect(verifications).toContain('value="hold"');
    expect(verifications).toContain("Reject");
    expect(verifications).toContain('return "on hold"');
    expect(verifications).toContain('["verify", "hold", "decline", "revoke"]');
  });

  it("provides a scoped admin overview", () => {
    const routes = read("app/routes.ts");
    const dashboard = read("app/routes/dashboard.tsx");
    const workspace = read("app/routes/admin-workspace.tsx");
    expect(routes).toContain('route("admin", "routes/admin-workspace.tsx")');
    expect(dashboard).toContain('to="/admin"');
    expect(dashboard).toContain("Admin workspace");
    expect(workspace).toContain("visibleAdminWorkspaceItems");
    expect(workspace).toContain("loadAdminWorkspaceAccess");
  });
});
