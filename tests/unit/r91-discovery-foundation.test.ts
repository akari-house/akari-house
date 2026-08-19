import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("R91 discovery and installability foundation", () => {
  it("removes remote fonts and avoids global homepage-art preloads", () => {
    const root = readFileSync("app/root.tsx", "utf8");
    const arrival = readFileSync(
      "app/components/house/InteractiveArrival.tsx",
      "utf8",
    );
    expect(root).not.toContain("fonts.googleapis.com");
    expect(root).not.toContain('rel: "preload"');
    expect(arrival).toContain("arrival-960.webp");
    expect(arrival).toContain("arrival-1440.webp");
    expect(arrival).toContain('fetchPriority="high"');
  });

  it("keeps authenticated member discovery out of search indexing", () => {
    const root = readFileSync("app/root.tsx", "utf8");
    const robots = readFileSync("public/robots.txt", "utf8");
    expect(root).toContain('"/members"');
    expect(robots).toContain("Disallow: /members");
  });

  it("uses a dynamic sitemap and exact square install icons", () => {
    const routes = readFileSync("app/routes.ts", "utf8");
    const manifest = JSON.parse(
      readFileSync("public/site.webmanifest", "utf8"),
    ) as {
      icons: Array<{ sizes: string; purpose: string }>;
      shortcuts?: unknown[];
    };
    const iconSizes = manifest.icons.map((icon) => icon.sizes);
    const iconPurposes = manifest.icons.map((icon) => icon.purpose);

    expect(routes).toContain('route("sitemap.xml", "routes/sitemap.ts")');
    expect(iconSizes).toContain("192x192");
    expect(iconSizes).toContain("512x512");
    expect(iconPurposes).toContain("maskable");
    expect(manifest.shortcuts?.length).toBeGreaterThanOrEqual(3);
  });

  it("generates responsive assets deterministically during build", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["prepare:ui-assets"]).toContain(
      "scripts/prepare-ui-assets.mjs",
    );
    expect(pkg.scripts.build).toContain("prepare:ui-assets");
    expect(pkg.scripts["test:e2e:serve"]).toContain("prepare:ui-assets");
  });
});
