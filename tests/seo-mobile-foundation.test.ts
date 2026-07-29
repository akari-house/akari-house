import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("SEO and mobile discovery foundation", () => {
  it("publishes a crawler policy and production sitemap", () => {
    const robots = readProjectFile("public/robots.txt");
    const sitemap = readProjectFile("public/sitemap.xml");

    expect(robots).toContain("Sitemap: https://akarihouse.com/sitemap.xml");
    expect(robots).toContain("Disallow: /admin/");
    expect(sitemap).toContain("https://akarihouse.com/");
    expect(sitemap).toContain("https://akarihouse.com/deals");
    expect(sitemap).not.toContain("/admin/");
  });

  it("provides mobile Web metadata using official brand assets", () => {
    const manifest = JSON.parse(readProjectFile("public/site.webmanifest")) as {
      name: string;
      display: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string }>;
    };
    const root = readProjectFile("app/root.tsx");

    expect(manifest.name).toBe("AKARI House");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#090b14");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/assets/brand/app-icon.png",
          sizes: "512x481",
        }),
      ]),
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
    expect(root).toContain('"noindex, nofollow"');
    expect(root).toContain('/^\\/deals\\/[^/]+(?:\\/|$)/');
  });
});
