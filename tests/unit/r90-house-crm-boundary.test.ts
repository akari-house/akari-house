import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("R90 House / CRM boundary hardening", () => {
  it("keeps the House session cookie host-only", () => {
    const auth = read("app/lib/auth.server.ts");
    expect(auth).toContain('const cookieName = "akari_session"');
    expect(auth).not.toMatch(/Domain\s*=\s*\.?akarihouse\.com/i);
  });

  it("keeps CRM-only routes out of House", () => {
    const routes = read("app/routes.ts");
    for (const retired of [
      "admin/agreements",
      "admin/relationships",
      "admin/operating-rhythm",
      "admin/finance",
      "admin/workspaces",
      "workspace-invitations/accept",
    ]) {
      expect(routes).not.toContain(retired);
    }
  });

  it("removes retired SaaS workspace invitation compatibility", () => {
    expect(read("app/lib/email.server.ts")).not.toContain(
      "sendWorkspaceInvitationEmail",
    );
    expect(read("app/lib/email.server.ts")).not.toContain(
      "workspace-invitations/accept",
    );
    expect(read("app/routes/login.tsx")).not.toContain(
      "workspace-invitations/accept",
    );
  });

  it("keeps canonical House hosts and redirects noncanonical production hosts", () => {
    const worker = read("worker/index.ts");
    const root = read("app/root.tsx");
    expect(root).toContain('const productionOrigin = "https://akarihouse.com"');
    expect(worker).toContain(
      'const productionCanonicalHost = "akarihouse.com"',
    );
    expect(worker).toContain('"www.akarihouse.com"');
    expect(worker).toContain('"akari-house.spacematesxyz.workers.dev"');
    expect(worker).toContain("Response.redirect(url.toString(), 308)");
  });

  it("declares the server-only CRM bridge explicitly in production deploy config", () => {
    const workflow = read(".github/workflows/deploy-production.yml");
    expect(workflow).toContain(
      'CRM_API_URL: "https://crmakari.pages.dev/api/v1"',
    );
    expect(workflow).toContain('CRM_NDA_BRIDGE_MODE: "legacy"');
    expect(workflow).toContain(
      "Confirm noncanonical Worker redirects to AKARI House",
    );
  });
});
