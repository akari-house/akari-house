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

  it("uses an active-only flat verification queue", () => {
    const verifications = read("app/routes/admin-verifications.tsx");
    const styles = read("app/styles/verification-queue.css");
    expect(verifications).toContain("rv.status = 'pending'");
    expect(verifications).toContain("Reviewed history");
    expect(verifications).toContain("Claims {titleCase(item.role)}");
    expect(verifications).toContain('className="verification-row"');
    expect(verifications).not.toContain("<details");
    expect(styles).toContain(".verification-actions");
  });

  it("offers approve, hold and reject directly on each active claim", () => {
    const verifications = read("app/routes/admin-verifications.tsx");
    expect(verifications).toContain('value="verify"');
    expect(verifications).toContain('value="hold"');
    expect(verifications).toContain('value="decline"');
    expect(verifications).toContain("Approved and rejected claims");
    expect(verifications).toContain("const PAGE_SIZE = 50");
    expect(verifications).toContain(
      "function queueHref(view: VerificationView, role: string",
    );
    expect(verifications).toContain(
      "<strong>{firstResult}</strong> to <strong>{lastResult}</strong>",
    );
  });

  it("uses a compact membership approval queue with a persistent review panel", () => {
    const applications = read("app/routes/admin-applications.tsx");
    const styles = read("app/styles/admin-console.css");
    expect(applications).toContain('className="application-review-layout"');
    expect(applications).toContain('className="application-review-list"');
    expect(applications).toContain('className="application-review-panel"');
    expect(applications).toContain("Approve &amp; next");
    expect(applications).toContain('value="request_info"');
    expect(applications).not.toContain('className="application-card"');
    expect(styles).toContain(".application-review-row");
    expect(styles).toContain(".application-review-panel");
  });

  it("provides a compact scoped admin overview instead of large cards", () => {
    const routes = read("app/routes.ts");
    const dashboard = read("app/routes/dashboard.tsx");
    const workspace = read("app/routes/admin-workspace.tsx");
    const styles = read("app/styles/admin-console.css");
    expect(routes).toContain('route("admin", "routes/admin-workspace.tsx")');
    expect(dashboard).toContain('to="/admin"');
    expect(dashboard).toContain("Admin workspace");
    expect(workspace).toContain("visibleAdminWorkspaceItems");
    expect(workspace).toContain("loadAdminWorkspaceAccess");
    expect(workspace).toContain('className="admin-overview-list"');
    expect(workspace).toContain('className="admin-overview-row"');
    expect(workspace).not.toContain('className="admin-overview-grid"');
    expect(styles).toContain(".admin-overview-row");
  });
});
