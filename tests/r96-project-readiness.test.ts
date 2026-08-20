import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildProjectReadiness } from "../app/lib/project-readiness";

describe("R96 project readiness", () => {
  it("guides an incomplete Founder project to the first missing essential", () => {
    const readiness = buildProjectReadiness({
      slug: "akari-test",
      title: "AKARI Test",
      summary: "A clear summary that is long enough for discovery.",
      description:
        "A sufficiently complete project story that explains the problem, product and intended audience in clear language.",
      seeking: "fundraising,gtm_marketing",
      logoKey: null,
      bannerKey: null,
      hasWebsite: false,
      socialCount: 0,
    });

    expect(readiness.score).toBe(33);
    expect(readiness.nextAction).toMatchObject({
      key: "logo",
      href: "/projects/akari-test/edit/brand",
    });
  });

  it("reports a complete project as discovery ready", () => {
    const readiness = buildProjectReadiness({
      slug: "ready-project",
      title: "Ready Project",
      summary: "A clear summary that is long enough for discovery.",
      description:
        "A sufficiently complete project story that explains the problem, product and intended audience in clear language.",
      seeking: "fundraising",
      logoKey: "logo.webp",
      bannerKey: "banner.webp",
      hasWebsite: true,
      socialCount: 2,
    });

    expect(readiness.score).toBe(100);
    expect(readiness.status).toBe("ready");
    expect(readiness.nextAction).toBeNull();
  });

  it("keeps readiness in the Founder project desk without changing persistence", () => {
    const manage = readFileSync("app/routes/project-manage.tsx", "utf8");
    const create = readFileSync("app/routes/project-new.tsx", "utf8");
    const css = readFileSync("app/styles/project-needs.css", "utf8");

    expect(manage).toContain("buildProjectReadiness");
    expect(manage).toContain("Project readiness");
    expect(manage).toContain("pr.banner_key AS bannerKey");
    expect(create).toContain("Create project and continue");
    expect(css).toContain(".project-readiness-track");
  });
});
