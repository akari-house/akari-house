import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("R95 discovery density", () => {
  it("loads project banners into public discovery", () => {
    const projects = readFileSync("app/routes/projects.tsx", "utf8");
    const card = readFileSync(
      "app/components/discovery/ProjectLanternCard.tsx",
      "utf8",
    );

    expect(projects).toContain("pr.banner_key AS bannerKey");
    expect(projects).toContain("<ProjectLanternCard");
    expect(card).toContain("bannerKey?: string | null");
    expect(card).toContain("project-lantern-banner");
    expect(card).toContain("/media/projects/${project.slug}/banner");
  });

  it("keeps discovery compact on desktop and responsive on mobile", () => {
    const css = readFileSync("app/styles/r78-authenticated-density.css", "utf8");

    expect(css).toContain(".member-card-grid.is-list .member-card");
    expect(css).toContain("min-height: 86px");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(css).toContain(".project-lantern-banner");
    expect(css).toContain("@media (max-width: 700px)");
  });
});
