import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("R90 House / CRM boundary hardening", () => {
  it("keeps House production identity canonical", () => {
    const config = read("wrangler.jsonc");
    const root = read("app/root.tsx");
    const robots = read("public/robots.txt");

    expect(config).toContain('"APP_URL": "https://akarihouse.com"');
    expect(config).toContain('"TURNSTILE_HOSTNAME": "akarihouse.com"');
    expect(root).toContain('const productionOrigin = "https://akarihouse.com"');
    expect(robots).toContain("Sitemap: https://akarihouse.com/sitemap.xml");
  });

  it("keeps the House session cookie host-only", () => {
    const auth = read("app/lib/auth.server.ts");
    expect(auth).toContain('const cookieName = "akari_session"');
    expect(auth).not.toMatch(/Domain\s*=\s*\.?akarihouse\.com/i);
    expect(auth).not.toContain("Domain=.akarihouse.com");
  });

  it("does not reintroduce CRM-only product routes", () => {
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

  it("does not retain dead SaaS workspace invitation behavior", () => {
    const email = read("app/lib/email.server.ts");
    const login = read("app/routes/login.tsx");

    expect(email).not.toContain("sendWorkspaceInvitationEmail");
    expect(email).not.toContain("workspace-invitations/accept");
    expect(login).not.toContain("workspace-invitations/accept");
  });

  it("declares the server-side CRM bridge explicitly in production deployment", () => {
    const workflow = read(".github/workflows/deploy-production.yml");
    expect(workflow).toContain('CRM_API_URL: "https://crmakari.pages.dev/api/v1"');
    expect(workflow).toContain('CRM_NDA_BRIDGE_MODE: "legacy"');
  });
});
