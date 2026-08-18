import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("AKARI House and CRM route boundary", () => {
  it("redirects legacy CRM-only House entry points to the CRM boundary route", () => {
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
      expect(routes).toContain(`\"${path}\"`);
    }

    expect(routes.match(/routes\/crm-boundary-redirect\.ts/g)?.length).toBe(8);
    expect(redirectRoute).toContain("crmProductBoundary.url");
    expect(redirectRoute).toContain("redirect(crmProductBoundary.url, 302)");
    expect(redirectRoute).toContain("redirect(crmProductBoundary.url, 303)");
  });
});
