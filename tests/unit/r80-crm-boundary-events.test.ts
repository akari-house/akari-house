import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("R82 CRM boundary", () => {
  it("keeps CRM-only operating routes out of AKARI House", () => {
    const routes = read("app/routes.ts");

    for (const legacyRoute of [
      'route("admin/agreements"',
      'route("admin/relationships"',
      'route("admin/operating-rhythm"',
      'route("admin/finance"',
      'route("admin/workspaces"',
      'route("workspaces/:slug"',
      'route("workspace-invitations/accept"',
      'route("api/crm/creators"',
    ]) {
      expect(routes).not.toContain(legacyRoute);
    }

    expect(routes).toContain(
      'route("api/creator-directory", "routes/public-creator-directory.ts")',
    );
    expect(routes).toContain(
      'route("admin/events", "routes/admin-events.tsx")',
    );
  });

  it("removes duplicate and CRM-named implementation modules from House", () => {
    for (const legacyFile of [
      "app/lib/agreement-tracking.ts",
      "app/lib/operating-rhythm.server.ts",
      "app/lib/operating-rhythm.ts",
      "app/lib/relationship-intelligence.ts",
      "app/lib/commercial-attention.server.ts",
      "app/lib/commercial-saas.server.ts",
      "app/lib/commercial-saas.ts",
      "app/lib/saas-workspace.server.ts",
      "app/lib/workspace-invitations.server.ts",
      "app/lib/crm-creator-feed.server.ts",
      "app/routes/crm-creator-feed.ts",
    ]) {
      expect(existsSync(legacyFile), legacyFile).toBe(false);
    }

    expect(existsSync("app/lib/public-creator-directory.server.ts")).toBe(true);
    expect(existsSync("app/routes/public-creator-directory.ts")).toBe(true);
  });

  it("keeps CRM promotion and workflow language out of House admin UI", () => {
    const workspaceRoute = read("app/routes/admin-workspace.tsx");

    expect(workspaceRoute).not.toContain("https://crm.akarihouse.com");
    expect(workspaceRoute).not.toContain("One CRM source of truth.");
    expect(workspaceRoute).not.toContain("agreement operations");
    expect(workspaceRoute).not.toContain("relationship operations");
    expect(workspaceRoute).toContain("membership, verification");
  });

  it("keeps commercial renewal CRM workflow out of House campaign closeout", () => {
    const closeout = read("app/routes/campaign-closeout.tsx");
    const model = read("app/lib/campaign-closeout.ts");

    expect(closeout).not.toContain("Renewal and upsell");
    expect(closeout).not.toContain("Commercial CRM / reference link");
    expect(closeout).not.toContain("operational CRM marker");
    expect(closeout).not.toContain('intent === "save-renewal"');
    expect(closeout).not.toContain("campaign.renewal_recorded");
    expect(model).not.toContain("campaignRenewalTypes");
    expect(model).not.toContain("campaignRenewalStages");
    expect(model).not.toContain("renewalConverted");
  });

  it("preserves historical CRM-era tables until data reconciliation is complete", () => {
    const agreements = read("migrations/0116_agreement_tracking.sql");
    const relationships = read("migrations/0119_relationship_intelligence.sql");
    const commercial = read("migrations/0121_commercial_saas_completion.sql");

    expect(agreements).toContain("CREATE TABLE agreement_records");
    expect(relationships).toContain("CREATE TABLE relationship_records");
    expect(commercial).toContain("CREATE TABLE saas_workspaces");
  });

  it("removes duplicate CRM modules from House admin navigation", () => {
    const workspace = read("app/lib/admin-workspace.ts");

    expect(workspace).toContain('label: "Event publishing"');
    expect(workspace).toContain('to: "/admin/events"');

    for (const route of [
      "/admin/agreements",
      "/admin/relationships",
      "/admin/operating-rhythm",
      "/admin/finance",
      "/admin/workspaces",
    ]) {
      expect(workspace).not.toContain(route);
    }
  });
});

describe("R80 Event publishing", () => {
  it("makes publication note optional but keeps decline reason mandatory", () => {
    const adminEvents = read("app/routes/admin-events.tsx");

    expect(adminEvents).toContain('decision === "decline"');
    expect(adminEvents).toContain("suppliedNote.length < 5");
    expect(adminEvents).toContain(
      "Published by an authorized AKARI administrator.",
    );
    expect(adminEvents).toContain('value="publish"');
    expect(adminEvents).toContain("Publish now");
  });

  it("keeps direct admin publishing visible from the event host desk", () => {
    const manage = read("app/routes/event-manage.tsx");

    expect(manage).toContain("canPublishEventsDirectly(user)");
    expect(manage).toContain('to="/admin/events"');
    expect(manage).toContain('direct ? "Publish event" : "Propose event"');
  });
});
