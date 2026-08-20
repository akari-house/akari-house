import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("SEO and mobile discovery foundation", () => {
  it("publishes a crawler policy and data-aware production sitemap", () => {
    const robots = readProjectFile("public/robots.txt");
    const routes = readProjectFile("app/routes.ts");
    const sitemapRoute = readProjectFile("app/routes/sitemap.ts");

    expect(robots).toContain("Sitemap: https://akarihouse.com/sitemap.xml");
    expect(robots).toContain("Disallow: /admin/");
    expect(robots).toContain("Disallow: /members");
    expect(routes).toContain('route("sitemap.xml", "routes/sitemap.ts")');
    expect(sitemapRoute).toContain('const origin = "https://akarihouse.com"');
    expect(sitemapRoute).toContain('"/deals"');
    expect(sitemapRoute).toContain("WHERE status = 'published'");
    expect(sitemapRoute).not.toContain('"/admin/"');
  });

  it("provides mobile Web metadata using exact AKARI install icons", () => {
    const manifest = JSON.parse(readProjectFile("public/site.webmanifest")) as {
      name: string;
      display: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string; purpose: string }>;
      shortcuts?: Array<{ url: string }>;
    };
    const root = readProjectFile("app/root.tsx");

    expect(manifest.name).toBe("AKARI House");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#090b14");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/assets/brand/app-icon-192.png",
          sizes: "192x192",
        }),
        expect.objectContaining({
          src: "/assets/brand/app-icon-512.png",
          sizes: "512x512",
        }),
        expect.objectContaining({
          src: "/assets/brand/app-icon-maskable-512.png",
          purpose: "maskable",
        }),
      ]),
    );
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(
      expect.arrayContaining(["/app", "/projects", "/campaigns", "/deals"]),
    );
    expect(root).toContain('rel: "manifest", href: "/site.webmanifest"');
    expect(root).toContain('name="apple-mobile-web-app-capable"');
    expect(root).toContain("viewport-fit=cover");
  });

  it("publishes canonical and social metadata while noindexing private routes", () => {
    const root = readProjectFile("app/root.tsx");

    expect(root).toContain('<link rel="canonical" href={canonicalUrl} />');
    expect(root).toContain('content="summary_large_image"');
    expect(root).toContain('type="application/ld+json"');
    expect(root).toContain('"/admin"');
    expect(root).toContain('"/members"');
    expect(root).toContain('"noindex, nofollow"');
    expect(root).toContain("/^\\/deals\\/[^/]+(?:\\/|$)/");
  });
});
