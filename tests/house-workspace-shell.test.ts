import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const header = readFileSync("app/components/SiteHeader.tsx", "utf8");
const root = readFileSync("app/root.tsx", "utf8");
const artworkStyles = readFileSync(
  "app/styles/house-workspace-art.css",
  "utf8",
);
const artwork = readFileSync("public/assets/house/workspace-house.svg", "utf8");

describe("AKARI House navigation boundary", () => {
  it("does not render the shared CRM-style workspace sidebar", () => {
    expect(existsSync("app/components/HouseWorkspaceSidebar.tsx")).toBe(false);
    expect(header).not.toContain("HouseWorkspaceSidebar");
    expect(header).not.toContain("isHouseWorkspacePath");
    expect(header).not.toContain("house-workspace-sidebar");
    expect(existsSync("app/styles/r82-house-native-workspace.css")).toBe(false);
  });

  it("keeps House navigation in the AKARI site header and account drawer", () => {
    for (const destination of [
      "/app",
      "/projects",
      "/deals",
      "/campaigns",
      "/events",
      "/connections",
      "/members",
      "/notifications",
      "/settings/account",
    ]) {
      expect(header).toContain(destination);
    }

    expect(header).toContain('className="site-header"');
    expect(header).toContain('aria-label="Your AKARI account"');
    expect(header).toContain("My House");
  });

  it("keeps House artwork independent from CRM product UI", () => {
    expect(root).toContain('import "./styles/house-workspace-art.css"');
    expect(artworkStyles).toContain(
      "Purpose-built AKARI House operations and administration artwork.",
    );
    expect(artworkStyles).toContain("/assets/house/workspace-house.svg");
    expect(artworkStyles).not.toContain("Purpose-built CRM");
    expect(artwork).toContain("Stylised AKARI House workspace illustration");
    expect(artwork).toContain("#ef3f82");
    expect(artwork).toContain("#ffd33d");
  });
});
