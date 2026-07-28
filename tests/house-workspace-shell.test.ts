import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  "app/components/HouseWorkspaceSidebar.tsx",
  "utf8",
);
const header = readFileSync("app/components/SiteHeader.tsx", "utf8");
const auth = readFileSync("app/lib/auth.server.ts", "utf8");
const access = readFileSync("app/lib/admin-workspace.server.ts", "utf8");
const styles = readFileSync("app/styles/house-workspace-shell.css", "utf8");

describe("shared AKARI workspace shell", () => {
  it("activates the sidebar across member, settings and admin workspaces", () => {
    for (const route of [
      'pathname === "/app"',
      'pathname.startsWith("/settings/")',
      'pathname.startsWith("/admin")',
      'pathname === "/connections"',
      'pathname === "/notifications"',
      'pathname === "/projects/manage"',
    ])
      expect(sidebar).toContain(route);

    expect(header).toContain("isHouseWorkspacePath");
    expect(header).toContain("HouseWorkspaceSidebar");
  });

  it("uses backend-derived scoped admin navigation", () => {
    expect(auth).toContain("loadOptionalAdminWorkspaceAccess");
    expect(access).toContain("return undefined");
    expect(sidebar).toContain("visibleAdminWorkspaceItems");
    expect(sidebar).toContain("user.adminAccess.accessLevel");
  });

  it("preserves real product destinations and role workspaces", () => {
    for (const destination of [
      "/members",
      "/connections",
      "/projects",
      "/campaigns",
      "/events",
      "/deals",
      "/notifications",
      "/profile-card",
      "/settings/account",
      "/settings/investor",
      "/projects/manage",
    ])
      expect(sidebar).toContain(destination);
    expect(sidebar).toContain("workspace navigation");
  });

  it("uses the approved House artwork and responsive sidebar behaviour", () => {
    expect(styles).toContain("/assets/optimized/arrival.webp");
    expect(styles).toContain(".house-workspace-sidebar");
    expect(styles).toContain("@media (min-width: 901px)");
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toContain(".investor-house-shell");
  });
});
