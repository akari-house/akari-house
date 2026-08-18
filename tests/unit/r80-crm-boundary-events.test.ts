import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("R80 CRM boundary", () => {
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
    ]) {
      expect(routes).not.toContain(legacyRoute);
    }

    expect(routes).toContain('route("api/crm/creators"');
    expect(routes).toContain('route("admin/events", "routes/admin-events.tsx")');
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

  it("directs operators to the canonical CRM application", () => {
    const workspaceRoute = read("app/routes/admin-workspace.tsx");

    expect(workspaceRoute).toContain("https://crm.akarihouse.com");
    expect(workspaceRoute).toContain("One CRM source of truth.");
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
