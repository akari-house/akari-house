import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("AKARI House and CRM route boundary", () => {
  it("redirects legacy CRM-only House entry points through unique route modules", () => {
    const routes = read("app/routes.ts");
    const redirectRoute = read("app/routes/crm-boundary-redirect.ts");

    for (const path of [
      "admin/agreements",
      "admin/relationships",
      "admin/relationships/:relationshipId",
      "admin/operating-rhythm",
      "admin/finance",
      "admin/workspaces",
      "workspaces/:slug",
      "workspace-invitations/accept",
    ]) {
      expect(routes).toContain(`"${path}"`);
    }

    expect(routes.match(/routes\/crm-boundary-[\w-]+\.ts/g)?.length).toBe(8);
    expect(redirectRoute).toContain("crmProductBoundary.url");
    expect(redirectRoute).toContain("redirect(crmProductBoundary.url, 302)");
    expect(redirectRoute).toContain("redirect(crmProductBoundary.url, 303)");
    expect(read("app/routes/crm-boundary-finance.ts")).toContain(
      'from "./crm-boundary-redirect"',
    );
  });
});
