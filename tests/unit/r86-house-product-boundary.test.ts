import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("R86 AKARI House product boundary", () => {
  it("keeps the original House network surfaces", () => {
    const routes = read("app/routes.ts");
    const sidebar = read("app/components/HouseWorkspaceSidebar.tsx");

    for (const route of [
      'route("projects", "routes/projects.tsx")',
      'route("deals", "routes/deals.tsx")',
      'route("campaigns", "routes/campaigns.tsx")',
      'route("events", "routes/events.tsx")',
      'route("connections", "routes/connections.tsx")',
      'route("members", "routes/members.tsx")',
    ]) {
      expect(routes).toContain(route);
    }

    expect(sidebar).toContain('label: "Members"');
    expect(sidebar).toContain('label: "Connections"');
    expect(sidebar).toContain('label: "Projects"');
    expect(sidebar).toContain('label: "Creator Campaigns"');
    expect(sidebar).toContain('label: "Events"');
    expect(sidebar).toContain('label: "Deals Room"');
  });

  it("does not expose retired CRM product routes in House", () => {
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

  it("removes the retired CRM-era diligence route implementation", () => {
    expect(existsSync("app/routes/project-diligence-completion.tsx")).toBe(
      false,
    );
    expect(existsSync("app/routes/+types/project-diligence-completion.ts")).toBe(
      false,
    );

    const route = read("app/routes/project-diligence-bridge.tsx");
    const actions = read("app/lib/house-diligence-actions.server.ts");
    expect(route).toContain('from "~/lib/house-diligence-actions.server"');
    expect(route).not.toContain("project-diligence-completion");
    expect(actions).not.toContain("agreement_records");
    expect(actions).not.toContain("counterparty_email");
  });

  it("keeps CRM implementation language out of the House diligence experience", () => {
    const route = read("app/routes/project-diligence-bridge.tsx");
    expect(route).not.toContain("CRM by AKARI");
    expect(route).not.toContain("CRM by Akari");
    expect(route).not.toContain("One CRM source of truth");
    expect(route).toContain("External NDA verification");
    expect(route).toContain("Agreements are handled outside the House.");
  });

  it("keeps the temporary server bridge and frozen tables until reconciliation is proven", () => {
    expect(existsSync("app/lib/crm-nda-bridge.server.ts")).toBe(true);
    expect(read("wrangler.jsonc")).toContain(
      '"CRM_NDA_BRIDGE_MODE": "legacy"',
    );
    expect(read("migrations/0116_agreement_tracking.sql")).toContain(
      "CREATE TABLE agreement_records",
    );
    expect(read("migrations/0119_relationship_intelligence.sql")).toContain(
      "CREATE TABLE relationship_records",
    );
    expect(read("migrations/0121_commercial_saas_completion.sql")).toContain(
      "CREATE TABLE saas_workspaces",
    );
  });
});
