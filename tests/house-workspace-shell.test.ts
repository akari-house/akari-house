import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  "app/components/HouseWorkspaceSidebar.tsx",
  "utf8",
);
const header = readFileSync("app/components/SiteHeader.tsx", "utf8");
const auth = readFileSync("app/lib/auth.server.ts", "utf8");
const access = readFileSync("app/lib/admin-workspace.server.ts", "utf8");
const root = readFileSync("app/root.tsx", "utf8");
const styles = readFileSync("app/styles/house-workspace-shell.css", "utf8");
const artworkStyles = readFileSync(
  "app/styles/house-workspace-art.css",
  "utf8",
);
const artwork = readFileSync(
  "public/assets/house/workspace-house.svg",
  "utf8",
);

describe("shared AKARI workspace shell", () => {
  it("activates the sidebar across member, settings and admin workspaces", () => {
    for (const route of [
      'pathname === "/app"',
      'pathname === "/members"',
      'pathname.startsWith("/settings/")',
      'pathname.startsWith("/admin")',
      'pathname === "/connections"',
      'pathname === "/notifications"',
      'pathname === "/projects/new"',
      'pathname === "/projects/manage"',
    ])
      expect(sidebar).toContain(route);

    expect(header).toContain("isHouseWorkspacePath");
    expect(header).toContain("HouseWorkspaceSidebar");
  });

  it("keeps public discovery routes cinematic", () => {
    expect(sidebar).toContain("isImmersiveHousePath");
    for (const route of [
      'pathname === "/"',
      'pathname === "/projects"',
      'pathname === "/campaigns"',
      'pathname === "/archive"',
      'pathname === "/team"',
      'pathname === "/membership"',
    ])
      expect(sidebar).toContain(route);

    expect(sidebar).toContain(
      "if (isImmersiveHousePath(pathname)) return false",
    );
  });

  it("uses backend-derived scoped admin navigation", () => {
    expect(auth).toContain("au.access_level AS adminAccessLevel");
    expect(auth).toContain("sessionAdminAccess");
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

  it("uses dedicated House artwork responsively", () => {
    expect(styles).toContain(".house-workspace-sidebar");
    expect(styles).toContain("@media (min-width: 901px)");
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toContain(".investor-house-shell");
    expect(root).toContain('import "./styles/house-workspace-art.css"');
    expect(artworkStyles).toContain("/assets/house/workspace-house.svg");
    expect(artworkStyles).not.toContain("/assets/optimized/arrival.webp");
    expect(artwork).toContain(
      "Stylised AKARI House workspace illustration",
    );
    expect(artwork).toContain("#ef3f82");
    expect(artwork).toContain("#ffd33d");
  });
});
